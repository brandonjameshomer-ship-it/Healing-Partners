# Putting this on healingpartners.us

> **Superseded in part.** The sales page is now live at
> `healingpartners.us/pages/for-funeral-homes`, written to the store through the Shopify Admin
> API rather than pasted into the page editor. **Read [`shopify/README.md`](shopify/README.md)
> first** — it describes how the page is pushed and how to change it.
>
> What is still current below: taking the store out of "Opening soon", making the Stripe
> payment link, and the `app.healingpartners.us` subdomain. What is superseded: Options A and B,
> which describe pasting HTML into the Shopify page editor.

Everything already lives on GitHub Pages. The job is to connect Shopify to it, not to rebuild
anything inside Shopify.

**The two URLs:**

| Page | URL |
|---|---|
| Sales page for funeral homes | `https://brandonjameshomer-ship-it.github.io/Healing-Partners/for-funeral-homes.html` |
| The prototype | `https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/` |

---

## Before anything else — take the store out of "Opening soon"

healingpartners.us is password-protected right now, so nobody can reach it.

**Shopify admin → Online Store → Preferences → Password protection** → uncheck it.

Nothing below works until that's off.

---

## Make the Stripe link (do this before the page goes up)

The sales page has a **Start your 3-day free trial** button. It needs a real Stripe Payment Link,
and one specific kind: a *subscription* with a *trial period*, not a one-off charge.

**What you sent me — `profile_61VF02K350AaL9HwVA6VF02J8fSQQ1m4omyoacWKu8YK` — is not a payment
link.** Payment links are full URLs beginning `https://buy.stripe.com/`. Here is how to get one.

1. **Stripe dashboard → Product catalogue → Add product**
   - Name: `Remember Them`
   - Description: `Memorial design software for funeral homes`
2. Under **Pricing**, choose **Recurring**
   - Amount `150.00`, currency USD, billing period **Monthly**
   - Save
3. **Payment links → New**, select that product
4. Open **Options → Subscription settings** and set **Free trial period → 3 days**
   *This is the step that makes it a trial. Miss it and the first card is charged immediately.*
5. Under **After payment**, set the confirmation page to
   `https://healingpartners.us/pages/thank-you` (or leave Stripe's default for now)
6. **Create link**, then **Copy** it. It looks like `https://buy.stripe.com/aEU5kQ2Xy4Vd1bO288`

Then paste it into **one place**: the bottom of `for-funeral-homes.html`, in the line

```js
var TRIAL_LINK = "";
```

Every trial button on the page reads from that one variable. Until it's filled in, the buttons
fall back to your email address rather than going nowhere.

**Two things worth knowing before you switch it on:**

- **A card is required to start a trial** on a Stripe payment link. That's normal for B2B, and it
  filters out people who were never going to buy. There is no card-free option on payment links.
- **Stripe takes 2.9% + $0.30.** On $150 that's $4.65, so you net **$145.35** a month per home.

Use **test mode** first — the toggle at the top of the Stripe dashboard. Test card `4242 4242 4242
4242`, any future expiry, any CVC. Test links contain `/test_`, so you can always tell which one
is pasted in.

---

## Option A — Link out (do this first)

## The homepage

The live homepage was still the stock Ritual demo — the hero read *"Fashion for the wild at heart.
Build your capsule collection…"* on a memorial company's site, above four products called "Example
product" at $100 each.

The replacement lives in this repo as `shopify/hp-home.liquid` and `shopify/index.json`, and is
already uploaded to the **unpublished** Ritual theme. Shopify blocks writes to the live theme, which
is the safety rail working as intended: nothing changed on healingpartners.us until you publish.

1. Preview it: **https://healingpartners.us/?preview_theme_id=162974466266**
2. If it looks right, **Online Store → Themes**, find the second *Ritual*, and **Publish**.

The page deliberately shows no products, because the only products in the store are the four demo
ones. It sells the subscription and sends funeral homes to the trial instead. When real products
exist, add them as their own section rather than putting them back on this template.

To change the copy later, edit `shopify/hp-home.liquid` here and upload it to the theme as
`snippets/hp-home.liquid` — the homepage template is a one-line `{% render 'hp-home' %}`, so it
never needs touching again.

---

**Ten minutes. Nothing can break.**

Shopify holds the sales page; the demo opens in a new tab. Not clever, but it works on every
device and there is nothing to debug in front of a funeral director.

1. **Online Store → Pages → Add page**
2. Title: `For Funeral Homes`
3. Click the **`< >`** button in the editor toolbar to switch to HTML view
4. Paste this. The Stripe link for the $150 six-month Partner rate is already in it — swap it only
   if you rebuild the payment link in Stripe:

```html
<div style="max-width:42rem;margin:0 auto;padding:2rem 0;font-size:1.0625rem;line-height:1.65">
  <h1 style="font-size:2.5rem;line-height:1.1;margin:0 0 1rem">
    You spend two to ten hours designing one headstone.
  </h1>
  <p style="font-size:1.25rem;color:#4A5473;margin:0 0 2rem">
    Multiple meetings with the family. Paper order forms. Then the proof comes back from the
    monument company wrong, and you start again. Remember Them does it with the family in
    about ten minutes.
  </p>
  <p style="display:flex;flex-wrap:wrap;gap:.75rem">
    <a href="https://buy.stripe.com/bJeaER6Vu47H3ddbMRbsc02"
       style="display:inline-block;background:#A8761F;color:#2A1E08;font-weight:600;
              padding:.875rem 1.5rem;border-radius:12px;text-decoration:none">
      Start your 3-day free trial
    </a>
    <a href="https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/"
       target="_blank" rel="noopener"
       style="display:inline-block;background:#fff;color:#191F33;font-weight:600;
              border:1px solid #C6CDDF;padding:.875rem 1.5rem;border-radius:12px;
              text-decoration:none">
      See it work first
    </a>
  </p>
  <p style="color:#7C85A0;font-size:.9375rem">
    Three days free. $150 a month after that. Cancel any time.
  </p>
</div>
```

5. **Save**, then **Online Store → Navigation** → add it to your main menu.

Your page is now at `healingpartners.us/pages/for-funeral-homes`.

---

## Option B — Embed the demo in the page

**Twenty minutes.** The prototype runs *inside* your Shopify page, so the address bar stays on
healingpartners.us throughout. Better for a click-through; slightly more that can go wrong.

Same steps as above, but paste this instead:

```html
<div style="max-width:60rem;margin:0 auto;padding:1rem 0">
  <h1 style="font-size:2.25rem;line-height:1.1;margin:0 0 .5rem">Remember Them</h1>
  <p style="color:#4A5473;margin:0 0 1.5rem">
    Design a memorial in about ten minutes. Try it below — nothing is saved, nothing is ordered.
  </p>

  <iframe
    src="https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/"
    title="Remember Them demo"
    loading="lazy"
    style="width:100%;height:820px;border:1px solid #DEE3EF;border-radius:12px;background:#F6F7FB">
  </iframe>

  <p style="color:#7C85A0;font-size:.9375rem;margin-top:.75rem">
    Trouble seeing it?
    <a href="https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/"
       target="_blank" rel="noopener">Open it in its own tab</a>.
  </p>
</div>
```

**Always keep that fallback link.** If the iframe fails on someone's phone, they still have a way
through — and you are not troubleshooting in front of a customer.

**On the height:** `820px` suits the interview. If it scrolls awkwardly on your theme, adjust it.
An iframe cannot resize itself to its content across domains, so this is a fixed number you tune
by eye.

---

## The reliable, expandable setup

Pasting HTML into a Shopify page works for a first meeting. **It is not what you want six months
from now**, for three concrete reasons:

- Shopify's rich-text editor **rewrites your markup on save**. It strips `<script>`, mangles some
  attributes, and reformats CSS. You will paste something that works and find it broken later
  without touching it.
- **Your theme's CSS collides with the pasted CSS.** A theme update can change how your page looks
  with no warning and no way to see it coming.
- **You cannot grow it.** Logins, saved designs, uploads, dashboards — none of that can live inside
  a Shopify page.

So split the job. This is the setup that holds:

| What | Where | Why |
|---|---|---|
| Marketing page | **Shopify**, built with your theme's sections | Matches the store, survives theme updates, editable without code |
| The product | **`app.healingpartners.us`**, its own host | Full control, no Shopify limits, room to grow into a real app |
| The link between them | A button on the Shopify page | The only connection needed |

### Step 1 — Point a subdomain at the app

In **Shopify admin → Settings → Domains → your domain → Manage DNS records**, add:

| Type | Name | Points to |
|---|---|---|
| CNAME | `app` | `brandonjameshomer-ship-it.github.io` |

Then create a file named `CNAME` (no extension, capital letters) in the repo root containing one
line: `app.healingpartners.us`. In **GitHub → repo Settings → Pages**, enter the same domain under
*Custom domain* and tick **Enforce HTTPS** once the certificate is issued (usually under an hour).

Everything now lives at `app.healingpartners.us` and looks like yours.

### Step 2 — Rebuild the marketing page with Shopify sections

Open the theme editor and build the page from your theme's own blocks: an image-with-text for the
hero, a multi-column for the four steps, a rich text for pricing. Copy the words out of
`for-funeral-homes.html`.

It takes longer than pasting once, and then it never breaks again — and you can edit the copy
yourself without opening a code editor.

### Step 3 — One button, pointing out

The Shopify page's primary button goes to your Stripe trial link. The secondary goes to
`https://app.healingpartners.us/remember-them/`. That is the whole integration.

### When you outgrow GitHub Pages

GitHub Pages serves static files only — no server, no secrets, no logins. The moment you need
those, move the app to **Vercel** or **Netlify** (both free to start, both deploy from the same
repo, both let you keep `app.healingpartners.us` by changing one DNS record). Nothing about the
Shopify side changes.

---

## Before you show anyone

- [ ] Password protection **off**, or they see nothing
- [ ] Open the demo on **your own phone** and walk all ten clicks
- [ ] Try it once on **the tablet you'd actually use** in the arrangement room
- [ ] Check the page on **mobile** — Shopify themes handle iframes differently
- [ ] Have the direct GitHub URL in your pocket as a backup

---

## What to say about what it is

Be straightforward — directors respect it more than polish:

> "The pricing is real, straight off my supplier's 2025 sheet. The stone colours are stand-ins
> until I photograph the actual samples. Nothing saves yet, and there's no login. It's a working
> demonstration of how the conversation goes, not a finished product."

Then let them use it themselves. Don't drive.

**The question worth asking afterwards:** *"Where does this get it wrong?"* — not "what do you
think?" The first invites the truth; the second invites politeness.
