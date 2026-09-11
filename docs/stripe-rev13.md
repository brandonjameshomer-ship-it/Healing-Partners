# Rebuilding Stripe for agreement Rev. 13

Every payment link on the site is disabled. They sold the retired plan — $150 on a six-month term,
$350 month to month, and the $200 discount recapture — none of which exists in Rev. 13. A partner
clicking one would have been signed to terms and a price that no longer exist, so the links were
emptied rather than left live. The pages fall back to the email address on each button, which is
their documented behaviour when a link is unset.

This is how to build the replacements.

---

## The thing to understand before you start

**Do not build three products.** The three tiers, the per-design overage and the ceiling are not
three things — they are one price curve, and Stripe expresses it natively as a *graduated tiered*
price. The agreement's own review reached the same conclusion from the sales side: *"stop selling
three plans and sell one sentence."*

| Designs in the month | Beta | Standard |
|---|---|---|
| 0–50 | $75 | $149 |
| 51–125 | $75 + $2 each | $149 + $4 each |
| 125 | **$225** — Professional's price | **$449** |
| 126–200 | $225 (flat) | $449 (flat) |
| 201–250 | $225 + $2 each | $449 + $4 each |
| 250 and above | **$325** — and never more | **$649** |

That curve *is* §6.2.1, §6.2.4 and §6.2.5 together. Essentials plus overage reaches Professional's
price at exactly 125 designs, and Professional plus overage reaches Unlimited's at exactly 250,
which is why the ceiling in §6.2.5 needs no special handling — the curve simply stops climbing.

**Authorized Users are separate and are not capped.** §6.2.5 says user fees are additional and not
subject to the ceiling, so they are a second line on the subscription, priced per seat.

---

## 1 · Archive what is retired

Stripe → **Product catalogue**. Archive, do not delete — existing records must keep resolving:

- the $150 six-month subscription
- the $350 month-to-month subscription
- the **$200 discount recapture** — Rev. 13 has no discounted term, so nothing can be recaptured

Then Stripe → **Payment links** and deactivate the three links. Their IDs are recorded in the
comments in `pay.html`, `pricing.html` and `for-funeral-homes.html`.

---

## 2 · Build the design subscription

**Two items on one subscription, not one.** A flat base fee, plus a metered price that charges
nothing until the allotment is used up.

The obvious alternative — a single graduated price with the $75 as `flat_amount` on tier one — has a
hole in it. Whether a tier's flat fee is charged when usage is **zero** is not clearly documented,
and a month in which a partner makes no designs must still bill the subscription fee: §6.2.3 sells
access, not designs. Splitting it removes the question rather than betting on the answer.

### 2a · The base fee

**Product catalogue → Add product**

- **Name** — "Remember Them — subscription"
- **Pricing model** — *Recurring*, **Flat rate**
- **Amount** — **$75.00**, **Monthly**

Add a second price on the same product at **$149.00 monthly** for the standard rate. Two prices on
one product, so the end of the beta is a price swap on the subscription item rather than a migration.

### 2b · The meter

**Billing → Meters → Create meter**

- **Event name** — `designs`
- **Aggregation** — **Sum**
- **Value field** — the numeric field your app sends (`value`)

Since API version `2025-03-31.basil` the legacy usage-records API is gone: **every metered price
needs a backing meter**, and usage is reported as meter events. There is no way to attach usage to a
price without one.

### 2c · The overage price

On the **same product** as the base fee, **Add another price**:

- **Pricing model** — *Usage-based* → **Per tier** → **Graduated**
- **Meter** — `designs`
- **Billing period** — Monthly

| First unit | Last unit | Per unit | Why |
|---|---|---|---|
| 1 | 50 | **$0.00** | included in the base fee |
| 51 | 125 | **$2.00** | climbs from $75 to $225 |
| 126 | 200 | **$0.00** | flat across Professional's allotment |
| 201 | 250 | **$2.00** | climbs from $225 to $325 |
| 251 | ∞ | **$0.00** | the ceiling — §6.2.5 |

Stripe's "up to" is **inclusive**, so "up to 50" means units 1–50.

Then a second overage price for standard rates: identical bands, **$4.00** in place of each $2.00.

### 2d · Prove it before going on

Stripe previews the total as you enter tiers. Check all six:

| Designs | Base | Overage | Total |
|---|---|---|---|
| 0 | $75 | $0 | **$75** |
| 50 | $75 | $0 | **$75** |
| 125 | $75 | $150 | **$225** |
| 200 | $75 | $150 | **$225** |
| 250 | $75 | $250 | **$325** |
| 1,000 | $75 | $250 | **$325** |

If 125 comes out at $227 or $223 the boundaries are off by one; if 1,000 is not $325 the last tier is
not free. Both are far cheaper to catch here than on a partner's first invoice.

### 2e · What the app must send

Report one meter event per delivered Design, with the customer's Stripe id. **Do not report:**
designs made during the free trial (§6.5.1), regenerations correcting a Company error, withdrawn or
undelivered variants, previews and intermediate renders, or a re-render of an existing design at a
different size or file type (§6.3.2). §6.3.5 resolves inconclusive billing disputes in the partner's
favour, so an over-counting meter is a liability, not a rounding error.

## 3 · Build the seat subscription

Same product catalogue, **separate product**: "Remember Them — additional user".

- **Pricing model** — Standard, per unit
- **$75.00** monthly (beta price) and a second price at **$149.00** (standard)
- Quantity is the number of Authorized Users **beyond the administrator**, who is included free

Do not put seats on the graduated price. They must not be capped by the ceiling.

---

## 4 · The free trial, and the part Stripe cannot do

§6.5.1 as amended is *seven days, or the first 70 Designs, whichever ends later*.
(The agreement artifact still reads three Memorial Projects — it needs the same change.)

Stripe trials are time-based only. Set **`trial_period_days = 7`** on the subscription, then handle
the second half in code:

- `customer.subscription.trial_will_end` fires three days before the trial ends. The webhook
  already listens for it.
- On that event, count the partner's reported Designs. If fewer than 70, extend `trial_end`.
- Repeat until 70 designs exist, then let it end.

Counting Designs rather than Projects makes this simpler: the meter already counts them, so the
trial condition reads the same number the invoice will.

§6.5.2 also requires notice **in the Platform and by email at least two days before** the trial
ends, and §6.5.1 says designs generated during the trial **do not count toward any tier** — so the
usage records you report to the meter must exclude them.

---

## 5 · Secrets and the webhook endpoint

In Terminal, never in a chat window:

```sh
cd ~/Projects/Healing-Partners
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
```

Then Stripe → **Developers → Webhooks → Add endpoint**:

```
https://zhtjgigkgpzrzeaqjwsv.supabase.co/functions/v1/stripe-webhook
```

Select exactly the events the function handles — anything else is noise it will ignore:

`checkout.session.completed` · `checkout.session.expired` ·
`checkout.session.async_payment_failed` · `customer.subscription.created` ·
`customer.subscription.updated` · `customer.subscription.trial_will_end` ·
`customer.subscription.deleted` · `invoice.paid` · `invoice.payment_failed` · `charge.refunded`

Copy the signing secret, then:

```sh
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets list          # confirm both appear; it prints digests, not values
```

Send a test webhook from Stripe. **200** is success. **400** means the signing secret is not set or
does not match. **500** is a handler error — the response body says which.

---

## 6 · The code change this needs

`supabase/functions/stripe-webhook/index.ts` still contains:

```ts
const isRecapture = !memorialId && amount === 200;
```

That is dead under Rev. 13 and worse than dead: any future $200 payment without a memorial id will
be booked as a recapture that no longer exists in the agreement. Remove the branch, and drop
`'recapture'` from the `payment_events_event_type_check` constraint in a new migration once no rows
use it.

`pay.html` also still wires `data-plan="recapture"`, which now matches no element — harmless, since
the wiring loop finds nothing, but it should go with the rest.

---

## 7 · Put the links back

Once the products exist, create Payment Links for the beta price and set them in the three files.
Each is a single constant near the top:

- `pay.html` — `TERM_LINK`, `MONTHLY_LINK`, `RECAPTURE_LINK` *(delete the third)*
- `pricing.html` — `TERM_LINK`, `MONTHLY_LINK`
- `for-funeral-homes.html` — `TRIAL_LINK`

They must be full URLs beginning `https://buy.stripe.com/`. A bare `price_...` id is not a payment
link and will not work. Any left empty falls back to the email address already on its button, which
is the safe state — never leave a customer a button that goes nowhere.

---

## What to check afterwards

- A checkout at 0 designs bills the flat fee, not nothing.
- 125 designs bills $225, 250 bills $325, 1,000 still bills $325.
- A second Authorized User adds $75 **on top of** the ceiling, not inside it.
- Cancelling mid-month leaves nothing further owed — §6.10.2 is thirty days' notice, no early-exit
  charge, and no recapture.
