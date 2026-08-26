# Database migrations

SQL that has been applied to the Remember Them Supabase project, in order. The
project was built through the dashboard rather than the CLI, so
`supabase_migrations.schema_migrations` is empty and this directory is the
record of what changed and why.

Each file is idempotent where Postgres allows it (`if not exists`,
`create or replace`), so re-running one is safe.

## Applying

Paste the file into the SQL editor at
<https://supabase.com/dashboard/project/_/sql>, or run it with the CLI:

```sh
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_partner_retail_markup.sql
```

Apply them in numeric order. 0003 drops and recreates `commission_rate()`, so
anything calling it should be redeployed afterwards.

## Contents

| File | What it does |
|---|---|
| `0001_partner_retail_markup.sql` | Makes the 2.5x retail multiplier a Partner setting, per agreement s6.8 |
| `0002_proof_approvals.sql` | Records proof approval as formal evidence and gates order status on it, per s3.3-s3.4 |
| `0003_commission_schedules.sql` | Replaces the superseded overlapping commission bands with the agreement's two schedules |

## Still open

- **Subscription plan choice.** `funeral_homes.subscription` is a bare numeric
  defaulting to 150. The agreement offers two rates - $150/month on a six-month
  initial term with automatic payment, or $350/month month-to-month - and a
  Discount Recapture Amount of ($350 - $150) x months provided at the discount
  when a Partner leaves the discounted plan early. None of that is
  representable yet.
- **Revision metering.** Exhibit A meters revision rounds per memorial with an
  included count and a per-round overage fee. `designs` versions rows but does
  not count billable rounds.
- **Data retention.** s9 gives Partners export during the term and for 30 days
  after, with deletion inside 90 days of termination. Nothing records a
  termination date to count from.
