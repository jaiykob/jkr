-- Order flow (2026-10-10): a visit carries its 2 hour window, market, the
-- quote and travel it was booked at, the final price, payment state, the
-- booking payment and saved card, and the customer's consent. db/schema.sql
-- already has these columns; run this only on a database created from an
-- older schema.sql. Safe to run twice.
--
-- Pay at booking (founder, 2026-10-10): the quoted total is paid when the
-- customer books (the booking PaymentIntent, stripe_payment_intent_id, which
-- refunds go back to); after the job a bigger size is charged the difference
-- and a smaller one refunded it.
alter table public.visits add column if not exists window_key text;
alter table public.visits add column if not exists market text;
alter table public.visits add column if not exists quoted_load_idx int;
alter table public.visits add column if not exists quoted_load_cents int;
alter table public.visits add column if not exists quoted_cents int;
alter table public.visits add column if not exists travel_cents int;
alter table public.visits add column if not exists final_load_idx int;
alter table public.visits add column if not exists final_cents int;
-- paid | payment_needed | refunded | late_fee_kept
alter table public.visits add column if not exists payment_status text;
-- What the customer has paid (the booking, plus any difference charged after
-- the job) and what was refunded since, in cents. Net paid = paid - refunded.
alter table public.visits add column if not exists paid_cents int;
alter table public.visits add column if not exists refunded_cents int;
alter table public.visits add column if not exists stripe_payment_method_id text;
alter table public.visits add column if not exists stripe_payment_intent_id text;
alter table public.visits add column if not exists invoice_url text;
alter table public.visits add column if not exists consent_at timestamptz;
alter table public.visits add column if not exists consent_version text;
alter table public.visits add column if not exists en_route_at timestamptz;
alter table public.visits add column if not exists booking_notified_at timestamptz;
-- The customer said no on site: the job is closed, not canceled ahead of time.
alter type public.visit_status add value if not exists 'declined';
-- One visit per booking payment: a redelivered webhook cannot duplicate it.
create unique index if not exists visits_payment_intent_uidx on public.visits(stripe_payment_intent_id);
create index if not exists visits_slot_idx on public.visits(market, scheduled_date, window_key);
