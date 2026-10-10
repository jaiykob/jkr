-- Order flow (2026-10-10): a visit carries its 2 hour window, market, the
-- quote and travel it was booked at, the final price, payment state, the saved
-- card and the customer's consent. db/schema.sql already has these columns;
-- run this only on a database created from an older schema.sql. Safe to run twice.
alter table public.visits add column if not exists window_key text;
alter table public.visits add column if not exists market text;
alter table public.visits add column if not exists quoted_load_idx int;
alter table public.visits add column if not exists quoted_load_cents int;
alter table public.visits add column if not exists quoted_cents int;
alter table public.visits add column if not exists travel_cents int;
alter table public.visits add column if not exists final_load_idx int;
alter table public.visits add column if not exists final_cents int;
-- card_saved | paid | payment_needed | no_charge | late_fee_paid
alter table public.visits add column if not exists payment_status text;
alter table public.visits add column if not exists stripe_setup_intent_id text;
alter table public.visits add column if not exists stripe_payment_method_id text;
alter table public.visits add column if not exists stripe_payment_intent_id text;
alter table public.visits add column if not exists invoice_url text;
alter table public.visits add column if not exists consent_at timestamptz;
alter table public.visits add column if not exists consent_version text;
alter table public.visits add column if not exists en_route_at timestamptz;
-- One visit per saved card setup: a redelivered webhook cannot duplicate it.
create unique index if not exists visits_setup_intent_uidx on public.visits(stripe_setup_intent_id);
create index if not exists visits_slot_idx on public.visits(market, scheduled_date, window_key);
