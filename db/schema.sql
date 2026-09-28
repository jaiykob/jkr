-- ============================================================================
-- Brand Name — Operational schema (the booking + fulfillment spine)
-- ----------------------------------------------------------------------------
-- Canonical, versioned source of truth for the Supabase Postgres schema.
-- Apply in the Supabase SQL editor (or via the CLI). Idempotent where practical
-- so it can be re-run as it evolves.
--
-- This is the backbone the whole post-booking workflow hangs on:
--   book -> notify -> visit (before photo / after photo / send) -> next -> dashboard -> route
--
-- Security model (deny-by-default):
--   * anon (the browser key in leads.js)  -> NO access to these tables.
--   * authenticated customer (magic-link login)  -> read ONLY their own rows.
--   * service_role (server APIs + the VPS agent)  -> full access, bypasses RLS.
--     All writes (booking, status flips, photos) go through service_role on the
--     server. Customers never write directly.
--
-- Existing `public.leads` (quote-stage capture) is intentionally left untouched;
-- this spine begins where a lead becomes a paying customer.
-- ============================================================================

create extension if not exists "pgcrypto";          -- gen_random_uuid()

-- ── updated_at helper ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.visit_status as enum
    ('scheduled','en_route','in_progress','completed','skipped','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sub_status as enum
    ('incomplete','active','past_due','canceled','paused','one_time');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- customers — one row per paying account. Created at checkout (service_role).
-- `user_id` stays null until the customer claims their dashboard via magic link;
-- the account-claim flow links auth.users.id here so RLS can scope to "their own".
-- ============================================================================
create table if not exists public.customers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,  -- set on dashboard claim
  stripe_customer_id text unique,
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  -- service location
  address           text,
  city              text,
  zip               text,
  lat               double precision,   -- geocoded for route optimization
  lng               double precision,
  -- service facts
  access_notes      text,                -- parking, stairs, gate codes
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists customers_user_id_idx on public.customers(user_id);
create index if not exists customers_zip_idx      on public.customers(zip);
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ============================================================================
-- subscriptions — the plan a customer is on. One-time cleans get a row too
-- (status = 'one_time', stripe_subscription_id null) so visits always have a parent.
-- ============================================================================
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references public.customers(id) on delete cascade,
  stripe_subscription_id text unique,
  plan                   text,                 -- 'weekly' | 'quarterly' | 'one_time' ('monthly' pre-2026-08-13)
  frequency              text,                 -- short code mirrored from the quote (e.g. 'bi-weekly')
  freq_idx               int,                  -- 0..5 column into the price matrix
  pickup_day             text,                 -- 'Monday'..'Friday'
  load_size              text,                 -- 'Single item' .. 'Full truck'
  price_cents            int,                  -- amount charged per cycle
  status                 public.sub_status not null default 'incomplete',
  current_period_end     timestamptz,
  started_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on public.subscriptions(customer_id);
create index if not exists subscriptions_status_idx   on public.subscriptions(status);
drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- visits — one row per scheduled service occurrence. The operator's unit of work
-- and the home for the before/after photo workflow and route sequencing.
-- ============================================================================
create table if not exists public.visits (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers(id) on delete cascade,
  subscription_id   uuid references public.subscriptions(id) on delete set null,
  scheduled_date    date not null,
  status            public.visit_status not null default 'scheduled',
  -- route optimization: which day's run this belongs to and its order within it
  route_date        date,
  route_seq         int,
  -- field timestamps (mark-done flow)
  started_at        timestamptz,           -- set when 'before' photo is taken
  completed_at      timestamptz,           -- set when 'after' photo is taken + sanitized
  client_notified_at timestamptz,          -- when the "yard secured" photo went out
  reminder_sent_at  timestamptz,           -- day-before visitReminder email (dedupe)
  operator_notes    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Backfill for an already-applied schema (idempotent):
alter table public.visits add column if not exists reminder_sent_at timestamptz;
create index if not exists visits_customer_idx   on public.visits(customer_id);
create index if not exists visits_route_idx       on public.visits(route_date, route_seq);
create index if not exists visits_scheduled_idx   on public.visits(scheduled_date, status);
drop trigger if exists visits_updated_at on public.visits;
create trigger visits_updated_at before update on public.visits
  for each row execute function public.set_updated_at();

-- ============================================================================
-- visit_photos — before/after/gate proof. Files live in the PRIVATE
-- `visit-photos` storage bucket; this table holds the object path + metadata.
-- customer_id is denormalized so RLS can scope photo reads without a join.
-- `gate` backs the "the gate's latched" claim in the serviceComplete email.
-- ============================================================================
create table if not exists public.visit_photos (
  id                uuid primary key default gen_random_uuid(),
  visit_id          uuid not null references public.visits(id) on delete cascade,
  customer_id       uuid not null references public.customers(id) on delete cascade,
  kind              text not null check (kind in ('before','after','gate')),
  storage_path      text not null,         -- object path in the private bucket
  taken_at          timestamptz not null default now(),
  sent_to_client_at timestamptz,
  created_at        timestamptz not null default now()
);
-- Backfill for an already-applied schema (idempotent): the original constraint
-- allowed only before/after. It was auto-named by Postgres, so rather than trust
-- a guessed name — a wrong guess would no-op and leave 'gate' silently rejected
-- in the field — drop whatever check constraints reference `kind`, then add ours
-- back by name. Safe to re-run; widening a check never rejects existing rows.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'visit_photos'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.visit_photos drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.visit_photos add constraint visit_photos_kind_check
  check (kind in ('before','after','gate'));
create index if not exists visit_photos_visit_idx    on public.visit_photos(visit_id);
create index if not exists visit_photos_customer_idx on public.visit_photos(customer_id);

-- ============================================================================
-- Row-Level Security — deny-by-default, then grant the narrow customer reads.
-- service_role bypasses RLS, so server APIs + the agent keep full write access.
-- ============================================================================
alter table public.customers     enable row level security;
alter table public.subscriptions enable row level security;
alter table public.visits        enable row level security;
alter table public.visit_photos  enable row level security;

-- customers: a logged-in customer reads only their own account row.
drop policy if exists customers_self_select on public.customers;
create policy customers_self_select on public.customers
  for select to authenticated
  using (user_id = auth.uid());

-- subscriptions: read only those tied to your customer row.
drop policy if exists subscriptions_self_select on public.subscriptions;
create policy subscriptions_self_select on public.subscriptions
  for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id = subscriptions.customer_id and c.user_id = auth.uid()
  ));

-- visits: read only your own visits.
drop policy if exists visits_self_select on public.visits;
create policy visits_self_select on public.visits
  for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id = visits.customer_id and c.user_id = auth.uid()
  ));

-- visit_photos: read only your own photos (customer_id denormalized for speed).
drop policy if exists visit_photos_self_select on public.visit_photos;
create policy visit_photos_self_select on public.visit_photos
  for select to authenticated
  using (exists (
    select 1 from public.customers c
    where c.id = visit_photos.customer_id and c.user_id = auth.uid()
  ));

-- NOTE: no INSERT/UPDATE/DELETE policies for `authenticated` or `anon` by design.
-- Every write is performed server-side with the service_role key (checkout API,
-- Stripe webhook, admin console endpoints, VPS agent). Deny-by-default holds.

-- ============================================================================
-- Storage bucket (run once; private). Photo objects are reached only via
-- short-lived signed URLs minted server-side — never public.
-- ----------------------------------------------------------------------------
--   insert into storage.buckets (id, name, public)
--   values ('visit-photos','visit-photos', false)
--   on conflict (id) do nothing;
--
-- With a private bucket and no storage policies for anon/authenticated, only
-- service_role can read/write objects, and the dashboard shows photos via signed
-- URLs the server generates after checking the requester owns the visit.
-- ============================================================================

-- ============================================================================
-- leads — quote-stage capture from the browser (js/leads.js, anon key).
-- At Scoops Co. this table was created by hand before the spine existed and
-- never lived in this file; it is written out here so a fresh project gets it.
-- Every column below is one the pages actually send.
-- Anon may INSERT only. Nothing is readable with the browser key.
-- ============================================================================
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  service       text,            -- 'junk' | 'referral'
  first_name    text,
  last_name     text,
  email         text,
  phone         text,
  zip           text,
  address       text,
  frequency     text,
  quoted_price  numeric(10,2),   -- DOLLARS (the pages divide cents by 100)
  notes         text,
  source_url    text,
  user_agent    text,
  utm           jsonb,
  created_at    timestamptz not null default now()
);
alter table public.leads enable row level security;
drop policy if exists leads_anon_insert on public.leads;
create policy leads_anon_insert on public.leads for insert to anon with check (true);
