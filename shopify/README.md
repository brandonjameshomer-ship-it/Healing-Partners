# The Shopify side of healingpartners.us

## What is live right now

| Thing | Where |
|---|---|
| Sales landing page | `https://healingpartners.us/pages/for-funeral-homes` |
| Its source of truth | `shopify/for-funeral-homes.page.html` (this folder) |
| The designer it links to | `https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/` |
| Shopify page ID | `gid://shopify/Page/137389080794` |

The page is in the main menu as **For Funeral Homes**, with a second item, **See the
Designer**, going straight to the prototype.

---

## How the page gets onto the store

Not by pasting into Shopify's page editor. The page is written to the store through the
**Shopify Admin GraphQL API**, from the file in this folder.

```
shopify/for-funeral-homes.page.html   ← edit this
        │
        │  strip the comment header, collapse to one line
        ▼
shopify/for-funeral-homes.body.html   ← generated, never edited by hand
        │
        │  pageUpdate(id: "gid://shopify/Page/137389080794", page: { body: … })
        ▼
healingpartners.us/pages/for-funeral-homes
```

Regenerate the upload body with:

```sh
awk 'f{print} /^-->$/{f=1}' shopify/for-funeral-homes.page.html \
  | tr '\n' ' ' | sed 's/  */ /g; s/^ //; s/ $//' \
  > shopify/for-funeral-homes.body.html
```

Then push it with the `pageUpdate` mutation. Claude can do this directly through the Shopify
connector in a session; there is no token to manage and nothing to install.

### If you want it to be a one-command push instead

Create a **custom app** in Shopify admin (Settings → Apps and sales channels → Develop apps →
Create an app), give it the Admin API scopes `write_content` and `read_content`, install it, and
copy the Admin API access token. Then the whole push is a single curl:

```sh
curl -s "https://npjw1i-fj.myshopify.com/admin/api/2026-07/graphql.json" \
  -H "X-Shopify-Access-Token: $SHOPIFY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data @<(jq -n --rawfile body shopify/for-funeral-homes.body.html \
    '{query:"mutation($id:ID!,$b:String!){pageUpdate(id:$id,page:{body:$b}){userErrors{message}}}",
      variables:{id:"gid://shopify/Page/137389080794", b:$body}}')
```

Keep that token out of this repository. The repo is public.

---

## Rules this page is built to, and why

**Never open the page in Shopify's rich-text editor and press Save.** The editor rewrites
markup on save: it strips `<script>`, mangles attributes and reformats CSS. The page will look
fine when you paste it and be broken a week later without anyone touching it. Edit the file
here and push.

**No JavaScript on the page.** Everything works without it — the FAQ uses `<details>`, the
demo is a plain `<iframe>`. Nothing to be stripped, nothing to break.

**All CSS is scoped under `.hp-lp`.** The Ritual theme's stylesheet cannot reach into the page,
and the page's styles cannot leak into the rest of the store. A theme update cannot change how
this page looks.

**Colours are explicit, never inherited.** Same reason.

**Full-bleed bands escape the theme's page container** with
`width:100vw; left:50%; margin-left:-50vw`. That is what lets the dark hero run edge to edge
inside a container the theme controls.

---

## Still to do

- [ ] **Turn off password protection.** Online Store → Preferences → Password protection.
      Until this is off, nobody outside the admin can see any of it. This cannot be changed
      through the API — it is the one step that has to be done by hand.
- [ ] **Make the Stripe payment link** — a *subscription* with a *3-day trial*, not a one-off
      charge. Every "Start your 3-day free trial" button currently opens an email instead.
      Once the link exists, all five buttons are swapped in one push.
- [ ] **Point `app.healingpartners.us` at GitHub Pages** so the demo link stops reading
      `brandonjameshomer-ship-it.github.io`. Settings → Domains → Manage DNS →
      CNAME `app` → `brandonjameshomer-ship-it.github.io`, plus a `CNAME` file in the repo root.
      Then update the two `src`/`href` values in the page and push.

---

## Before you show anyone

- [ ] Password protection off, or they see nothing
- [ ] Walk the whole demo on **your own phone**
- [ ] Try it on **the tablet you would actually use** in the arrangement room
- [ ] Check the page on mobile — the iframe is 640px tall there, 800px on desktop
- [ ] Keep the direct GitHub URL in your pocket as a backup

**The question worth asking afterwards:** *"Where does this get it wrong?"* — not "what do you
think?" The first invites the truth; the second invites politeness.

---

## Drift between this folder and the live store

**The store does not update when `main` updates.** Nothing connects them. The page is pushed by
hand, so this folder can be correct while healingpartners.us is wrong, silently, for as long as
nobody looks.

That has already happened once.

### The September 2026 drift

Commit `6e7d707`, *"Charge the discount recapture as a flat $200"*, changed the recapture terms in
`for-funeral-homes.page.html`. **It was never pushed to Shopify.** For the period between that
commit and the push, the live sales page quoted the harsher term to every funeral home that read
it:

| | Recapture wording |
|---|---|
| Live on the store | the discount is recaptured — **$200 for each month** you had it at the partner rate |
| This folder | the discount is recaptured — **a flat $200**, however many months you had the partner rate |

On a six-month partner rate that is the difference between owing $200 and owing up to $1,200, and
the root `README.md` is explicit that Sec. 5.2 permits the per-month charge but that it is waived.
The store was quoting an un-waived term the business does not intend to charge.

### A second finding, from the same check

The drift check also caught a visible defect the eye slides over. The live page carries
\`&amp;nearr;\` where this folder has \`&nearr;\` — double-escaped somewhere in an earlier push — so
the main demonstration link reads:

> Open it full screen &nearr;

instead of showing the arrow. It is one character class of bug and it sits beside the primary call
to action on the sales page.

Nothing else had drifted: 101 of 104 sentences matched, and the remaining difference was
non-breaking-hyphen encoding, which \`check-drift.js\` now normalises so it does not report every
run.

### How to check for drift

Compare the visible text of the live page against the body in this folder. Entities have to be
decoded first or the comparison produces false positives on `&mdash;`, `&ndash;` and friends.

```sh
curl -s https://healingpartners.us/pages/for-funeral-homes > /tmp/live.html
node shopify/check-drift.js          # prints any sentence in this folder that is not live
```

Run it after any commit that touches `shopify/`, and before telling anyone the page is current.

### How to push, and why not through the connector

`shopify/for-funeral-homes.body.html` is 30,900 bytes on one line. Pushing it through a chat
connector means an assistant retyping the whole thing into an API call, and a single dropped
character breaks a live sales page. **Do not push it that way.** Use a token and let the bytes go
straight from the file:

1. Shopify admin → Settings → Apps and sales channels → Develop apps → Create an app.
2. Admin API scopes `write_content` and `read_content`. Install it. Copy the token.
3. Keep the token out of this repository — it is public. Put it in your shell profile or a
   password manager, and export it when you need it.

```sh
export SHOPIFY_ADMIN_TOKEN=shpat_…

awk 'f{print} /^-->$/{f=1}' shopify/for-funeral-homes.page.html \
  | tr '\n' ' ' | sed 's/  */ /g; s/^ //; s/ $//' \
  > shopify/for-funeral-homes.body.html

curl -s "https://npjw1i-fj.myshopify.com/admin/api/2026-07/graphql.json" \
  -H "X-Shopify-Access-Token: $SHOPIFY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data @<(jq -n --rawfile body shopify/for-funeral-homes.body.html \
    '{query:"mutation($id:ID!,$b:String!){pageUpdate(id:$id,page:{body:$b}){userErrors{message}}}",
      variables:{id:"gid://shopify/Page/137389080794", b:$body}}')
```

Then re-run the drift check. `userErrors` should be empty and every sentence should be live.

### If a push goes wrong

Every previous body is in git. Restore the one before the bad push and send it the same way:

```sh
git show <commit>^:shopify/for-funeral-homes.body.html > /tmp/restore.html
```
