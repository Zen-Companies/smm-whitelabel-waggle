// Putting CRM events in the queue (crm_events). Database writes only, so it's safe from the Stripe
// webhook (rule 3); the jobs route sends them (features/crm). A dedupe key makes every call safe
// to repeat: the same thing happening twice is queued once.

import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import type { CrmEvent } from "./catalog";

export interface QueuedCrmEvent {
  event: CrmEvent;
  details?: Record<string, string | number | boolean>;
  /** A note added to the contact with the event (title + body; the owner's own words only). */
  note?: { title: string; body: string };
  /** Unique per thing that happened, e.g. the Stripe event id. The user id is added. */
  dedupeKey: string;
}

/** The organization's owners: the contacts its lifecycle events are about. */
export async function organizationOwners(db: ServiceClient, orgId: string): Promise<string[]> {
  const { data, error } = await db
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("role", "owner");
  if (error) throw new Error(`crm: owner lookup failed: ${error.message}`);
  return (data ?? []).map((m) => m.user_id);
}

export async function queueCrmEvent(
  db: ServiceClient,
  input: QueuedCrmEvent & { userId: string; orgId: string | null },
): Promise<void> {
  const { error } = await db.from("crm_events").upsert(
    {
      organization_id: input.orgId,
      user_id: input.userId,
      event: input.event,
      details: { ...(input.details ?? {}), ...(input.note ? { note: input.note } : {}) } as Json,
      dedupe_key: `${input.dedupeKey}:${input.userId}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`crm: queueing ${input.event} failed: ${error.message}`);
}

/** The same event for every owner of the organization. */
export async function queueForOwners(
  db: ServiceClient,
  orgId: string,
  input: QueuedCrmEvent,
): Promise<void> {
  for (const userId of await organizationOwners(db, orgId)) {
    await queueCrmEvent(db, { ...input, userId, orgId });
  }
}

/** Whether the organization ever paid: a trial_converted was queued for it. */
export async function organizationHasPaid(db: ServiceClient, orgId: string): Promise<boolean> {
  const { count, error } = await db
    .from("crm_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("event", "trial_converted");
  if (error) throw new Error(`crm: paid lookup failed: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Queues the events in a fire-and-forget spot (a button, a connect): a failure is logged, never
 * shown to the owner and never stops what they did.
 */
export async function queueQuietly(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error(`[crm] ${err instanceof Error ? err.message : "queueing failed"}`);
  }
}
