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

## Start in the sandbox

**Test mode needs no bank account, no EIN, and no identity verification.** Sign up, switch the
toggle to test mode, and you can have a working checkout in about ten minutes. Real money and bank
details can wait until you've seen it work.

The page detects a sandbox link automatically — any link containing `test_` — and shows a red
banner reading **"Stripe sandbox — no card is charged"** with the test card number on it. Nobody
can finish a demo believing a real payment went through.

### Ten-minute version

1. **stripe.com** → sign up. Skip every "complete your account" prompt.
2. Toggle to **Test mode**, top right.
3. **Product catalogue → Add product** → `Remember Them — 3D model`, `50.00 USD`, one time.
4. **Create payment link.** Under *After payment*, redirect to
   `https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/thank-you.html`
5. Copy the link — it will look like `https://buy.stripe.com/test_...`
6. In `remember-them/index.html`, set `billing: "family"` and paste it into `paymentLink`.
   Commit and push.
7. Walk the flow and pay with **4242 4242 4242 4242**, any future expiry, any CVC.

Apple Pay and Google Pay appear in the sandbox too, on a device that supports them — so you can see
the real experience without taking a cent.

---

## Going live later — about an hour

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

---

# The Stripe CLI — what it is and isn't for

These commands come up in Stripe's quickstart guides:

```
stripe login
stripe listen --forward-to localhost:4242/webhook
cd ~/stripe-checkout && ./setup.sh --webhook-secret whsec_xxxxx
./doctor.sh
```

**They do not apply to this project**, and running them will not get you anywhere. Here is why, and
what to do instead.

## Why they don't fit

`stripe listen --forward-to localhost:4242/webhook` forwards test events to **a web server running
on your own computer**, at port 4242. It exists so that a developer building a checkout on their
laptop can receive webhooks without deploying anything.

We have no server on your computer. The webhook handler is
`supabase/functions/stripe-webhook/index.ts`, and it runs on Supabase at a **public HTTPS address**.
Stripe can reach that directly — there is nothing to tunnel.

`~/stripe-checkout/setup.sh` and `doctor.sh` belong to a **Stripe sample application** you would
have to clone first. That sample is a Node server with its own checkout page. It is a different
architecture from this one and would replace, not complete, what is already built.

The Stripe CLI is also not installed on this Chromebook, and installing it would not change the
above.

## What to do instead — all in the browser

### 1. Deploy the handler

```
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` is deliberate: Stripe cannot present a Supabase token. The request is
authenticated by its **Stripe signature**, which the handler checks before trusting anything.

The function's address is:

```
https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
```

### 2. Register it with Stripe

**Stripe dashboard → Developers → Webhooks → Add endpoint.** Paste that URL and select these
events:

| Event | What it means |
|---|---|
| `checkout.session.completed` | A trial started, or a VR upgrade was paid |
| `invoice.paid` | A funeral home's monthly $150 went through |
| `invoice.payment_failed` | Their card was declined — chase it |
| `customer.subscription.trial_will_end` | Fires one day before the first charge |
| `customer.subscription.deleted` | They cancelled |
| `charge.refunded` | Money returned |

### 3. Copy the signing secret

Stripe shows a **Signing secret** beginning `whsec_`. Put it where the function can read it:

```
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
```

**Never commit either of these.** The repository is public.

### 4. Test it

In the dashboard, open your endpoint and use **Send test webhook**. A correct setup returns
`200`, and the delivery log shows the response. This replaces `stripe listen` entirely.

## One gap worth knowing about

The handler currently understands **one-off payments** — the $50 VR upgrade. It does not yet
understand **subscriptions**, which is what the $150/month trial creates. Until it does, a funeral
home starting a trial will be charged correctly by Stripe, but nothing in the dashboard will record
that they became a customer.

Registering the subscription events above is step one; teaching `record_payment` to handle them is
step two, and is not built yet. At low volume the Stripe dashboard is the source of truth in the
meantime — but this should not stay true past the first few customers.
