# A basic CRM and a KPI dashboard in `/jkr/`

Date: 2026-10-10. Status: asked for by the founder in chat ("also build basic
crm for customer tracking", "and basic dashboard for kpis"); a starting point
with defaults, to be confirmed when round 7 starts. Built as round 7, after the
order flow (round 6), because it reads what round 6 records: the size booked
and the size found, the final charge, the arrival window, unpaid jobs.

Both live in the existing admin dashboard (`jkr/index.html`, served at
`/jkr/`, behind `ADMIN_DASHBOARD_TOKEN` in the `x-admin-token` header only).
Both work on a phone (the owner in the truck) and on a desktop.

## The CRM: who is who, and what happens next

**People.** One list of everyone: customers who booked and leads who did not
yet. Search by name, phone, email or ZIP. Columns: name, town, status, jobs,
total paid, last job, next follow up.

**A person's page.** Contact details with tap to call, text, WhatsApp and
email; every job (date, window, size booked, size found, amount charged,
before and after photos, paid or not); every quote and lead they sent;
notes (dated, newest first, add one in a box); tags (for example realtor,
property manager, repeat); a follow up date with a reason.

**Lead status.** New, Contacted, Quoted, Booked, Lost (with a reason). Leads
come from the quote page's "email me a price", pre-launch reservations, the
commercial form and photo quotes (WhatsApp later). When a lead books, it joins
the customer by email or phone, so one person has one page.

**Today.** At the top of the dashboard: follow ups due today and overdue,
jobs today with their windows, unpaid jobs.

## The KPI dashboard: the Reports tab, filled in

A period switch (this week, this month, last 30 days, all time), and tiles:

- **Revenue**: money charged after jobs.
- **Jobs done** and **average job** (final charge).
- **Upsize rate**: share of jobs where the crew found a bigger size, and the
  average difference. The number that says whether the size cards work.
- **Leads in** and **lead to booking** conversion.
- **Bookings made**, **cancels**, **late cancels**, **said no on site**.
- **Unpaid**: jobs marked "payment needed", and the amount.
- **Schedule fill**: windows booked out of windows open, next 7 days.

Under the tiles: revenue by week (a simple chart), and jobs and revenue by
size, by travel zone and by town.

All figures are computed on the server from the database, behind the admin
token. Fail soft: a figure that cannot be read shows "n/a", never a wrong
number.

## Data

New: a `notes` table (person, text, time), lead `status`, `lost_reason`,
`follow_up_on` and `tags` on customers and leads. Round 6 already adds the
booked and found sizes, the window and the payment state to visits. Applied
as a migration in `db/migrations/` and folded into `db/schema.sql`.

## Testing

`npm test`: the KPI math against a fixed set of rows (revenue, upsize rate,
conversion, fill), the auth on every new endpoint, lead to customer joining.
The round 7 scorecard adds the dashboard at 360px and 1280px.

## Left out

Email or text campaigns from the CRM, automatic reminders for follow ups,
exporting, more than one login.
