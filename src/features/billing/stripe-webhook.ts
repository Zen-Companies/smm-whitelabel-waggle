import "server-only";
import type Stripe from "stripe";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { applyStripeEvent } from "./billing-store";

export class InvalidStripeWebhookError extends Error {}

/** Verifies Stripe's signature on the raw body (CLAUDE.md rule 4). Throws when it doesn't match. */
export function verifyStripeEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string | null,
  secret: string,
): Stripe.Event {
  if (!signature) throw new InvalidStripeWebhookError("no signature");
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new InvalidStripeWebhookError("bad signature");
  }
}

/**
 * Dedupe by event id in webhook_events, then store what it changes (database only, rule 3).
 * A duplicate that was already processed is acknowledged and skipped; one that failed before is
 * applied again (Stripe retries on any non-2xx).
 */
export async function receiveStripeEvent(
  db: ServiceClient,
  event: Stripe.Event,
): Promise<{ status: "processed" | "duplicate"; result?: string }> {
  const { error: insertError } = await db.from("webhook_events").insert({
    id: event.id,
    source: "stripe",
    event_type: event.type,
    payload: event as unknown as Json,
  });
  if (insertError) {
    if (insertError.code !== "23505")
      throw new Error(`webhook_events insert failed: ${insertError.message}`);
    const { data: seen } = await db
      .from("webhook_events")
      .select("processed_at")
      .eq("id", event.id)
      .maybeSingle();
    if (seen?.processed_at) return { status: "duplicate" };
  }
  try {
    const result = await applyStripeEvent(db, event);
    await db
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("id", event.id);
    return { status: "processed", result };
  } catch (e) {
    await db
      .from("webhook_events")
      .update({ error: e instanceof Error ? e.message.slice(0, 500) : "unknown" })
      .eq("id", event.id);
    throw e;
  }
}
