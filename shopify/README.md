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
