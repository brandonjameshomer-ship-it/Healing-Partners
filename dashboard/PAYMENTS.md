# Taking payment for the 3D/VR upgrade

The upgrade is **$50**. Two ways it gets paid, set per funeral home:

| `vr_billing` | Who pays | What happens |
|---|---|---|
| `home` *(default)* | The funeral home | $50 goes on their monthly invoice. No checkout, nothing to set up. |
| `family` | The family, directly | They pay you by card, Apple Pay or Google Pay. Needs the setup below. |

**The upgrade carries no commission either way.** The whole $50 is Healing Partners'. That's enforced
in the database — `monthly_commission` sums marker sales only, and upgrades live in their own view.

If you only ever use `home` billing, **skip this file entirely.** It already works.

---

## What you actually net

Stripe takes **2.9% + $0.30**, so a $50 upgrade pays you **$48.25**.

Worth knowing before you price anything else this way. On a $50 item the fixed 30¢ is small; on a
$5 item it would be brutal.

---

## Setup — about an hour, all in the browser

### 1. Create a Stripe account

**stripe.com** → Sign up. You'll need your business name, address, and the bank account where money
should land. Payouts start a few days after your first charge.

Stay in **test mode** — the toggle in the top corner — until the very end.

### 2. Create the Payment Link

**Product catalogue** → **Add product**.

- **Name:** `Remember Them — 3D model`
- **Description:** `A 3D model of your memorial, viewable at full size on a Meta Quest 3.`
- **Price:** `50.00 USD`, one time

Save, then **Create payment link** on that product.

### 3. Set where people land afterwards

In the link's settings, under **After payment**, choose **Don't show confirmation page** and set the
redirect to:

```
https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/thank-you.html
```

That page tells the family what happens next and roughly when. Without it they land on a bare
Stripe receipt, which is a cold way to end a conversation about someone's mother.

### 4. Turn on the wallets

**Settings → Payments → Payment methods.** Card, Apple Pay and Google Pay are on by default in
Checkout — confirm all three are enabled.

**Apple Pay needs the domain verified.** Under Payment methods → Apple Pay → Add domain, enter
`brandonjameshomer-ship-it.github.io`. Stripe gives you a verification file to host. On GitHub Pages
that means committing it to the repo at the path Stripe specifies. Google Pay needs nothing.

If you skip this, Apple Pay simply doesn't appear — cards still work, so it isn't urgent.

### 5. Put the link in the page

Open `remember-them/index.html`, find the config block near the top of the script, and set:

```js
var VR_UPGRADE = {
  price: 50,
  billing: "family",
  paymentLink: "https://buy.stripe.com/your_link_here"
};
```

Commit and push.

**Both fields matter.** With `billing: "family"` but an empty `paymentLink`, the page deliberately
falls back to the invoice wording rather than showing a button that goes nowhere.

### 6. Test before anyone real sees it

Still in test mode, walk the whole flow and pay with card **4242 4242 4242 4242**, any future
expiry, any CVC. Confirm you land on the thank-you page and the payment shows in Stripe.

Then flip Stripe to live mode, **create the payment link again** — test links don't work live — and
update the URL in the page.

---

## Matching a payment to a memorial

Each checkout carries a `client_reference_id` built from the person's name and a timestamp, so a
payment in your Stripe dashboard can be traced back to a specific memorial.

**Right now this is manual.** You read the reference off the payment and mark the design upgraded
yourself. At a handful of upgrades a month that's a two-minute job; past that it's an annoyance
worth automating.

**The fix, once Supabase is running:** an Edge Function creates each checkout session and a webhook
sets `vr_paid_at` and `vr_payment_ref` on the design automatically. Same Stripe account, same money
— you swap the link for a function call and nothing else changes.

---

## Things to know

**Refunds happen in Stripe**, not here. A family who changes their mind before the model is built
should get their money back without argument — it costs you the 30¢ and nothing else.

**Don't store card numbers.** You never see them; Stripe's hosted page handles it, which is what
keeps you clear of PCI compliance. Don't be tempted to build your own form.

**Test mode and live mode are separate worlds.** Separate keys, separate links, separate payments.
The most common mistake is shipping a test link and wondering why no money arrives.
