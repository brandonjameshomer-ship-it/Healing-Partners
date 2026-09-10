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

Stripe → **Product catalogue → Add product**.

- **Name** — "Remember Them — subscription"
- **Pricing model** — *Usage-based*, then **Graduated tiers**
- **Billing period** — Monthly
- **Usage metering** — create a meter named `designs`, aggregated by **sum** over the billing period

Then enter the tiers. **Beta price** (create this one first — it is what a partner signing today
pays):

| First unit | Last unit | Per unit | Flat fee |
|---|---|---|---|
| 1 | 50 | $0 | **$75.00** |
| 51 | 125 | **$2.00** | $0 |
| 126 | 200 | $0 | $0 |
| 201 | 250 | **$2.00** | $0 |
| 251 | ∞ | $0 | $0 |

Then add a **second price on the same product** for the standard rate, identical but with **$149**
flat and **$4.00** per unit in the two metered bands.

Two prices on one product, not two products — that makes the beta-to-standard move a price swap on
the subscription item rather than a migration.

**Check it before going further.** Stripe's tier editor previews a total; confirm 125 designs gives
$225 on the beta price and 250 gives $325. If either is off by a unit, the boundary is
inclusive/exclusive in the other direction than you entered.

---

## 3 · Build the seat subscription

Same product catalogue, **separate product**: "Remember Them — additional user".

- **Pricing model** — Standard, per unit
- **$75.00** monthly (beta price) and a second price at **$149.00** (standard)
- Quantity is the number of Authorized Users **beyond the administrator**, who is included free

Do not put seats on the graduated price. They must not be capped by the ceiling.

---

## 4 · The free trial, and the part Stripe cannot do

§6.5.1 is *seven days, or the first three Memorial Projects, whichever ends later*.

Stripe trials are time-based only. Set **`trial_period_days = 7`** on the subscription, then handle
the second half in code:

- `customer.subscription.trial_will_end` fires three days before the trial ends. The webhook
  already listens for it.
- On that event, count the partner's Memorial Projects. If fewer than three, extend `trial_end`.
- Repeat until three projects exist, then let it end.

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
