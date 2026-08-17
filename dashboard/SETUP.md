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

Open `dashboard/schema.sql` from this repo, copy the whole file, paste it in, and press **Run**.

Then **New query** again, and do the same with `dashboard/access.sql`. That one sets up the four
access tiers. Run it second — it depends on the tables the first file creates.

You should see *Success. No rows returned.* That's correct — you just created empty tables.

Check it worked: sidebar → **Table Editor**. You should see `funeral_homes`, `orders`,
`suppliers`, `user_profiles`, `memorials`, `memorial_access` and `designs`.

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

Open `dashboard/index.html` and find the config block near the top of the script:

```js
var SUPABASE_URL  = "";   // paste Project URL here
var SUPABASE_ANON = "";   // paste anon public key here
```

Paste both values between the quotes. Save, commit, push.

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
signed in, and check the policies from `schema.sql` ran.

**"Failed to fetch."** Usually the URL is wrong, or the project is paused. Check the Supabase
dashboard first.

**Sign-in email never arrives.** Free tier email is rate-limited and lands in spam a lot. For
testing, create users directly under Authentication → Users instead.
