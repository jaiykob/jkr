-- Travel zones (2026-10-07): each booking records its zone, travel fee and
-- road miles from the base. db/schema.sql already has these columns; run this
-- only on a database created from an older schema.sql. Safe to run twice.
alter table public.subscriptions add column if not exists travel_zone  text;
alter table public.subscriptions add column if not exists travel_cents int;
alter table public.subscriptions add column if not exists travel_miles numeric(5,1);
