// Stripe webhook — the only thing allowed to say a payment succeeded.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...
//
// --no-verify-jwt is correct here: Stripe cannot present a Supabase JWT. The
// request is authenticated by its Stripe signature instead, which is checked
// below before anything is trusted.

import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

// Service role: this function must write rows no signed-in user may write.
// It is never exposed to the browser.
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

/* ------------------------------------------------------------------
   Stripe sends unix seconds; Postgres wants an ISO timestamp. Null in,
   null out — a missing trial_end must not become 1970.
   ------------------------------------------------------------------ */
function ts(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

/* The monthly amount, in dollars, off the subscription's first price. */
function subAmount(sub: Stripe.Subscription): number | null {
  const cents = sub.items?.data?.[0]?.price?.unit_amount;
  return typeof cents === "number" ? cents / 100 : null;
}

/* One writer for every subscription event, so the shape can never drift
   between handlers. Idempotent in the database on stripe_event_id. */
async function writeSubscription(
  eventId: string,
  sub: Stripe.Subscription,
  eventType: string,
  extra: Record<string, unknown> = {},
) {
  const { error } = await db.rpc("record_subscription", {
    p_stripe_event_id: eventId,
    p_subscription_id: sub.id,
    p_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    p_status: sub.status,
    p_event_type: eventType,
    p_email: (sub.metadata?.email as string) ?? null,
    p_home_name: (sub.metadata?.funeral_home ?? sub.metadata?.home_name) as string ?? null,
    p_contact_name: (sub.metadata?.contact_name as string) ?? null,
    p_amount: subAmount(sub),
    p_trial_ends_at: ts(sub.trial_end),
    p_period_end: ts(sub.current_period_end),
    p_cancel_at_end: sub.cancel_at_period_end ?? false,
    p_livemode: sub.livemode ?? false,
    p_metadata: extra,
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // Read the RAW body. Parsing it first would break signature verification.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    // An unverified request is not from Stripe. Refuse it and say nothing useful.
    console.error("Signature verification failed:", err instanceof Error ? err.message : err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      /* ============================================================
         SUBSCRIPTIONS — the $150/month plan with its 3-day trial
         ============================================================ */

      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await writeSubscription(event.id, sub,
          sub.status === "trialing" ? "trial_started" : "activated");
        console.log(`Subscription ${sub.id} ${sub.status}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;

        // Name the transition rather than logging a generic "updated". Reading
        // "trial converted to active" months later beats reading "updated".
        let type = "updated";
        if (prev.status && prev.status !== sub.status) {
          if (sub.status === "active")    type = prev.status === "trialing" ? "activated" : "resumed";
          else if (sub.status === "past_due") type = "past_due";
          else if (sub.status === "canceled") type = "canceled";
        } else if (sub.cancel_at_period_end && prev.cancel_at_period_end === false) {
          type = "canceled";   // they asked to stop; access continues to period end
        }

        await writeSubscription(event.id, sub, type, { from: prev.status ?? null });
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Fires ~24h before the first charge. This is the moment to make sure
        // they have actually been set up — an unclaimed trial about to convert
        // is a customer who paid and never got onboarded.
        const sub = event.data.object as Stripe.Subscription;
        await writeSubscription(event.id, sub, "trial_ending");
        console.log(`Trial ending for ${sub.id} — check they are set up`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await writeSubscription(event.id, sub, "canceled");
        break;
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        if (!subId) break;   // one-off invoice, not a subscription

        // Re-fetch rather than trusting the invoice's summary of the
        // subscription: the invoice does not carry period_end or trial_end.
        const sub = await stripe.subscriptions.retrieve(subId);
        await writeSubscription(event.id, sub, "invoice_paid", {
          invoice: inv.id,
          amount_paid: (inv.amount_paid ?? 0) / 100,
        });
        console.log(`Invoice paid for ${subId}: $${(inv.amount_paid ?? 0) / 100}`);
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        await writeSubscription(event.id, sub, "payment_failed", {
          invoice: inv.id,
          attempt: inv.attempt_count ?? null,
          // Stripe retries for a while before giving up. Access is not cut here;
          // the status change to past_due / unpaid does that.
          next_attempt: ts(inv.next_payment_attempt),
        });
        console.warn(`Payment failed for ${subId}, attempt ${inv.attempt_count}`);
        break;
      }

      /* ============================================================
         ONE-OFF PAYMENTS — the $50 VR upgrade
         ============================================================ */

      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;

        // A subscription checkout is a trial starting, not a VR upgrade. The
        // subscription events above own it; recording it here as well would
        // book $150 as a VR sale.
        if (s.mode === "subscription") {
          console.log(`Subscription checkout ${s.id} — handled by subscription events`);
          break;
        }

        // Only act on money that actually cleared. A completed session with an
        // unpaid status is not a payment.
        if (s.payment_status !== "paid") break;

        const memorialId = s.client_reference_id ?? s.metadata?.memorial_id;
        if (!memorialId) {
          // Nothing to attach it to. Record it anyway so it is never invisible.
          console.warn("Paid session with no memorial reference:", s.id);
        }

        // record_payment is idempotent on stripe_event_id: Stripe retries
        // deliveries, and a duplicate must change nothing.
        const { data, error } = await db.rpc("record_payment", {
          p_stripe_event_id: event.id,
          p_memorial_id: memorialId ?? null,
          p_stripe_ref: s.id,
          p_amount: (s.amount_total ?? 0) / 100,   // Stripe works in cents
          p_event_type: "payment_succeeded",
          p_metadata: {
            email: s.customer_details?.email ?? null,
            mode: s.livemode ? "live" : "test",
          },
        });
        if (error) throw error;
        console.log(data ? `Recorded ${event.id}` : `Duplicate ${event.id}, ignored`);
        break;
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        // An abandoned subscription checkout is not a failed VR payment.
        if (s.mode === "subscription") break;
        await db.rpc("record_payment", {
          p_stripe_event_id: event.id,
          p_memorial_id: s.client_reference_id ?? null,
          p_stripe_ref: s.id,
          p_amount: null,
          p_event_type: event.type.endsWith("expired") ? "payment_cancelled" : "payment_failed",
          p_metadata: {},
        });
        break;
      }

      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        await db.rpc("record_payment", {
          p_stripe_event_id: event.id,
          p_memorial_id: c.metadata?.memorial_id ?? null,
          p_stripe_ref: c.payment_intent as string,
          p_amount: (c.amount_refunded ?? 0) / 100,
          p_event_type: "refunded",
          p_metadata: {},
        });
        break;
      }

      default:
        // Everything else is acknowledged and ignored. Returning non-200 would
        // make Stripe retry events we will never care about.
        break;
    }
  } catch (err) {
    // 500 asks Stripe to retry. Idempotency makes that safe.
    console.error("Handler failed:", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
