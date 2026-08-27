# Database migrations

SQL applied to the Remember Them Supabase project (`zhtjgigkgpzrzeaqjwsv`), in
order. The project was built through the dashboard rather than the CLI, so this
directory is the record of what changed and why.

Each file is idempotent where Postgres allows it (`if not exists`,
`create or replace`), so re-running one is safe.

## Status

| File | What it does | Applied |
|---|---|---|
| `0001_partner_retail_markup.sql` | Makes the 2.5x retail multiplier a Partner setting, per agreement s6.8 | yes |
| `0002_proof_approvals.sql` | Records proof approval as formal evidence and gates order status on it, per s3.3-s3.4 | yes |
| `0003_commission_schedules.sql` | Replaces the superseded overlapping commission bands with the agreement's two schedules | **no** |
| `0004_memorial_media.sql` | Records photographs and proofs stored in Cloudflare R2, and points proof approvals at a durable object rather than an expiring URL | **no** |

## Applying

The CLI is linked to the project and authenticates without a database password:

```sh
cd ~ && supabase db push --linked
```

`db push` needs every remote version present locally before it will run, so
fetch the whole directory, not just the outstanding file:

```sh
mkdir -p ~/supabase/migrations && cd ~/supabase/migrations
for f in 0001_partner_retail_markup 0002_proof_approvals 0003_commission_schedules \
         0004_memorial_media; do
  gh api -H "Accept: application/vnd.github.raw" \
    repos/brandonjameshomer-ship-it/Healing-Partners/contents/supabase/migrations/$f.sql > $f.sql
done
```

The alternative is the SQL editor at
<https://supabase.com/dashboard/project/zhtjgigkgpzrzeaqjwsv/sql>.

Note that the MCP server is configured with `read_only=true` in its URL, so it
can read this schema but never change it. That is a deliberate guard; the CLI is
the write path.

## Notes on 0003

It drops and recreates `commission_rate`, because adding a defaulted second
argument to the existing name would leave both versions resolvable and make
`commission_rate(5)` ambiguous. `monthly_commission` calls that function, so the
view is dropped first and recreated at the end of the same migration - a plain
`drop` rather than `drop ... cascade`, so that any dependent nobody knew about
halts the migration instead of being deleted silently. Anything else calling
`commission_rate` needs redeploying afterwards.

After applying, `monthly_commission` gains a `schedule` column and its `rate`
reflects the Covered schedule where a Partner qualifies.

## Notes on 0004

The bytes live in Cloudflare R2, not in Supabase: a scanned portrait is 4-20MB
and the free tier gives 1GB total with a 50MB per-file cap, so photographs would
exhaust it within weeks and bloat every backup. R2 also charges nothing for
downloads, which matters because the same portrait is fetched every time a
family opens the designer. See `dashboard/MEDIA.md` for the bucket setup.

It also redefines `proof_approvals_guard()` from 0002 to cover the new
`proof_media_id`. Without that, an approval could be re-pointed at a different
file after signing, which is precisely what the guard exists to prevent.

## Still open

- **Subscription plan choice.** `funeral_homes.subscription` is a bare numeric
  defaulting to 150. The agreement offers two rates - $150/month on a six-month
  initial term with automatic payment, or $350/month month-to-month - and a
  Discount Recapture Amount of ($350 - $150) x months provided at the discount
  when a Partner leaves the discounted plan early. None of that is
  representable yet, and `monthly_commission.total_owed` therefore adds a
  subscription figure that cannot distinguish the two plans.
- **Revision metering.** Exhibit A meters revision rounds per memorial with an
  included count and a per-round overage fee. `designs` versions rows but does
  not count billable rounds.
- **Data retention.** s9 gives Partners export during the term and for 30 days
  after, with deletion inside 90 days of termination. Nothing records a
  termination date to count from.
