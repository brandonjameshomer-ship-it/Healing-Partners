# Connecting the dashboard to Supabase

Everything here happens in your browser. Nothing to install on the Chromebook.

Budget about **45 minutes** the first time. Free tier is genuinely free — no card required.

---

## What you're building

| Piece | What it does |
|---|---|
| **Database** | Where orders actually live, instead of one browser |
| **Auth** | Sign-in, so the page isn't open to the internet |
| **Row Level Security** | Each funeral home sees only their own orders |
| **Storage** | Price lists, logos, photos, order forms |

---

## Step 1 — Make an account

Go to **supabase.com** and sign up. Signing in with GitHub is easiest, since you already have that
account.

## Step 2 — Create the project

Click **New project**.

- **Name:** `healing-partners`
- **Database password:** click Generate, then **save it somewhere you won't lose it.** You will not
  be shown it again, and you need it to recover the database.
- **Region:** pick the one closest to Portland — US West works.
- **Plan:** Free

It takes a couple of minutes to build. Leave the tab open.

## Step 3 — Create the tables

Left sidebar → **SQL Editor** → **New query**.

There are **nine SQL files**, and the order matters — each one builds on tables the earlier ones
created. Open each file from this repo, copy the whole thing, paste it into a new query, press
**Run**, then move to the next.

| # | File | Depends on | Adds |
|---|---|---|---|
| 1 | `schema.sql` | — | `funeral_homes`, `orders`, `suppliers` |
| 2 | `access.sql` | 1 | `user_profiles`, `memorials`, `memorial_access`, `designs` |
| 3 | `payments.sql` | 1, 2 | `payment_events` |
| 4 | `subscriptions.sql` | 1–3 | `subscriptions`, `subscription_events` |
| 5 | `pricing.sql` | 1–4 | Exhibit A/B terms; the insured Covered Schedule |
| 6 | `crm.sql` | 4 | `prospects`, `prospect_notes` |
| 7 | `emails.sql` | 6 | `email_suppressions`, `email_templates`, `email_log` |
| 8 | `compliance.sql` | 2 | `authorized_approvers`, `cemetery_records`, `family_authorizations`, `compliance_signatures` |
| 9 | `security-fixes.sql` | 2 | Closes access holes — run it **last** |

Two of these deserve a note.

**`pricing.sql` replaces the commission function.** `schema.sql` defines `commission_rate` with one
argument and only knows the Standard Schedule. `pricing.sql` replaces it with a two-argument version
that also knows the lower Covered Schedule for Partners carrying qualifying insurance. If you skip
file 5, insured Partners get overcharged.

**`security-fixes.sql` goes last on purpose.** It removes access paths the earlier files granted.
Running anything after it can re-open them.

**All nine are safe to re-run.** Every policy is dropped before it is recreated, so a run that fails
partway through can simply be run again from the top — you do not have to tear the project down and
start over.

You should see *Success. No rows returned.* That's correct — you just created empty tables.

Check it worked: sidebar → **Table Editor**. All **19 tables** should be there:

`authorized_approvers`, `cemetery_records`, `compliance_signatures`, `designs`, `email_log`,
`email_suppressions`, `email_templates`, `family_authorizations`, `funeral_homes`,
`memorial_access`, `memorials`, `orders`, `payment_events`, `prospect_notes`, `prospects`,
`subscription_events`, `subscriptions`, `suppliers`, `user_profiles`

If one is missing, find it in the table above and re-run that file.

Your own account is promoted to **founder** automatically, because the trigger matches on
`bhomer@healingpartners.us`. Everyone else who signs up starts as **family** and has to be promoted
deliberately — nobody can grant themselves staff access just by registering.

## Step 4 — Turn on sign-in

Sidebar → **Authentication** → **Providers**.

**Email** is on by default. Scroll down and turn **off** "Confirm email" while you're testing —
it saves you round trips. Turn it back on before anyone real uses this.

Then **Authentication → Users → Add user** and create your own account with your
`bhomer@healingpartners.us` address.

## Step 5 — Get your two keys

Sidebar → **Project Settings** → **API**. You need two values:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string starting `eyJ...`

> **These are safe to put in the code and commit to a public repo.** The anon key is designed to be
> public. What actually protects your data is Row Level Security, which Step 3 turned on. Never
> commit the **service_role** key — that one bypasses every rule.

## Step 6 — Put them in the page

**Two pages need them**, not one — `dashboard/index.html` (line 295) and
`dashboard/subscriptions.html` (line 216). Each has the same config block near the top of its
script:

```js
var SUPABASE_URL  = "";   // paste Project URL here
var SUPABASE_ANON = "";   // paste anon public key here
```

Paste both values between the quotes in **both files**. Save, commit, push. If you fill in only one,
that page goes live and the other silently stays in demo mode — which is exactly the kind of split
that makes the subscription queue look empty when it isn't.

The page detects them automatically: with them filled in it uses the database, and without them it
falls back to browser-only demo mode. That means it never breaks — it just changes where the data
lives.

## Step 7 — Add your first funeral home

Sidebar → **Table Editor** → `funeral_homes` → **Insert row**. Fill in the name and contact
details. The `id` and `created_at` fill themselves.

Reload the dashboard, sign in, and add an order against them.

---

## Things worth knowing

**The free project pauses after a week with no activity.** It doesn't delete anything — you click
Restore and it comes back in a minute. If you're demoing to a funeral home, open it the day before
so it's already awake.

**Free tier limits:** 500 MB database, 1 GB file storage, 50,000 monthly active users. You will not
come close for a long time. Price lists and logos are tiny.

**Back up before anything important.** Project Settings → Database → Backups. On free tier this is
manual, so do it yourself after adding real customer data.

**Never commit the service_role key.** If you ever paste it somewhere by accident, go to Project
Settings → API and rotate it immediately.

---

## If something goes wrong

**The table is empty but you added rows.** Almost always Row Level Security with no matching
policy — the database is correctly refusing to show you rows you have no policy for. Check you're
signed in, and check the policies from `access.sql` and `security-fixes.sql` ran.

**"Failed to fetch."** Usually the URL is wrong, or the project is paused. Check the Supabase
dashboard first.

**Sign-in email never arrives.** Free tier email is rate-limited and lands in spam a lot. For
testing, create users directly under Authentication → Users instead.
