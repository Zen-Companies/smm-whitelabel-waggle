// Sends the CRM queue to HighLevel (jobs route, every minute). Per event: upsert the contact with
// every field, then add the trigger tag; Walter's workflow does the rest. Oldest first per person,
// at least 30 s apart, so his workflow clears the tag before the next one and
// trial_converted always lands before a later canceled.

import * as Sentry from "@sentry/nextjs";
import { FOUNDING, FOUNDING_COUPON, getStripe } from "@/features/billing";
import { GhlError, type GhlClient } from "@/lib/ghl/client";
import { CRM_MIN_GAP_MS, CRM_TRIGGER_TAG, isCrmEvent, queueCrmEvent } from "@/lib/crm";
import type { ServiceClient } from "@/lib/supabase/service";
import { crmFields } from "./fields";
import { loadContact, loadSnapshot } from "./snapshot";

export const CRM_MAX_ATTEMPTS = 6;

export interface CrmSendSummary {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  /** HighLevel isn't set up here (no token): the queue waits. */
  notConfigured?: true;
}

type Row = {
  id: string;
  organization_id: string | null;
  user_id: string;
  event: string;
  details: unknown;
  attempts: number;
  created_at: string;
};

/** After the founding trial that took the last spot: tell the team (founding_full), once. */
async function checkFoundingFull(db: ServiceClient, row: Row): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;
  const coupon = await stripe.coupons.retrieve(FOUNDING_COUPON).catch(() => null);
  const max = coupon?.max_redemptions ?? FOUNDING.spots;
  if (coupon && coupon.times_redeemed >= max) {
    await queueCrmEvent(db, {
      event: "founding_full",
      userId: row.user_id,
      orgId: row.organization_id,
      dedupeKey: "founding_full",
    });
  }
}

export async function deliverCrmEvents(deps: {
  db: ServiceClient;
  client: GhlClient | null;
  now?: () => Date;
  shouldContinue?: () => boolean;
}): Promise<CrmSendSummary> {
  const { db, client } = deps;
  const out: CrmSendSummary = { sent: 0, retried: 0, failed: 0, skipped: 0 };
  if (!client) return { ...out, notConfigured: true };
  const now = deps.now?.() ?? new Date();

  const { data: due, error } = await db
    .from("crm_events")
    .select("id, organization_id, user_id, event, details, attempts, created_at")
    .eq("status", "pending")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`crm: queue lookup failed: ${error.message}`);

  // One event per person per run, their oldest.
  const firsts = new Map<string, Row>();
  for (const r of (due ?? []) as Row[]) if (!firsts.has(r.user_id)) firsts.set(r.user_id, r);

  for (const row of firsts.values()) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    // Walter's 30 s gap: the last event for this person must be done with first.
    const { data: last } = await db
      .from("crm_events")
      .select("sent_at")
      .eq("user_id", row.user_id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.sent_at && now.getTime() - new Date(last.sent_at).getTime() < CRM_MIN_GAP_MS) {
      continue;
    }
    // Claim it, so two runs never send the same row.
    const { data: claimed } = await db
      .from("crm_events")
      .update({ attempts: row.attempts + 1, next_attempt_at: null })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("attempts", row.attempts)
      .select("id");
    if (!claimed?.length) continue;

    try {
      if (!isCrmEvent(row.event)) throw new GhlError(`unknown event ${row.event}`, 400);
      const contact = await loadContact(db, row.user_id);
      if (!contact) {
        await db
          .from("crm_events")
          .update({ status: "skipped", last_error: "no email for this login" })
          .eq("id", row.id);
        out.skipped += 1;
        continue;
      }
      const snapshot = await loadSnapshot(db, { ...row, event: row.event }, now);
      const { contactId } = await client.upsertContact({
        email: contact.email,
        name: contact.name,
        companyName: snapshot.business || null,
        fields: crmFields(snapshot),
      });
      await client.addTags(contactId, [CRM_TRIGGER_TAG]);
      await db
        .from("crm_events")
        .update({
          status: "sent",
          sent_at: now.toISOString(),
          ghl_contact_id: contactId,
          last_error: null,
        })
        .eq("id", row.id);
      out.sent += 1;
      if (row.event === "trial_started" && snapshot.founding) {
        await checkFoundingFull(db, row).catch((e: unknown) => Sentry.captureException(e));
      }
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const attempts = row.attempts + 1;
      const limited = err instanceof GhlError && err.status === 429;
      const permanent =
        err instanceof GhlError && err.status >= 400 && err.status < 500 && !limited;
      if (permanent || attempts >= CRM_MAX_ATTEMPTS) {
        await db
          .from("crm_events")
          .update({ status: "failed", last_error: message })
          .eq("id", row.id);
        Sentry.captureException(err, { extra: { crmEventId: row.id, event: row.event } });
        out.failed += 1;
      } else {
        const wait = limited && err.retryAfterMs ? err.retryAfterMs : 2 ** attempts * 60_000;
        await db
          .from("crm_events")
          .update({
            last_error: message,
            next_attempt_at: new Date(now.getTime() + wait).toISOString(),
          })
          .eq("id", row.id);
        out.retried += 1;
      }
      // Rate limited: everything else waits too.
      if (limited) break;
    }
  }
  return out;
}
