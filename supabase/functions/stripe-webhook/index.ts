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
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;

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
