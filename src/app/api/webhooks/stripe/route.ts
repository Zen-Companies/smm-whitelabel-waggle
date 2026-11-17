import * as Sentry from "@sentry/nextjs";
import {
  getStripe,
  InvalidStripeWebhookError,
  receiveStripeEvent,
  verifyStripeEvent,
} from "@/features/billing";
import { getServiceClient } from "@/lib/supabase/service";

// Stripe (T86). Verify, dedupe, store (CLAUDE.md rules 3-4): the subscription and top-ups are
// written to the database, nothing else. Any non-2xx makes Stripe retry.
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();
  if (!secret || !stripe) {
    Sentry.captureMessage("Stripe webhook: STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not set");
    return Response.json({ error: "not configured" }, { status: 500 });
  }
  const rawBody = await request.text();
  let event;
  try {
    event = verifyStripeEvent(stripe, rawBody, request.headers.get("stripe-signature"), secret);
  } catch (e) {
    if (e instanceof InvalidStripeWebhookError) {
      return Response.json({ error: "invalid signature" }, { status: 400 });
    }
    throw e;
  }
  try {
    return Response.json(await receiveStripeEvent(getServiceClient(), event));
  } catch (error) {
    Sentry.captureException(error, { extra: { eventId: event.id, type: event.type } });
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
