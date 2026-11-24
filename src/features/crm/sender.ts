// Sends the CRM queue to HighLevel (jobs route, every minute). Per event: upsert the contact with
// every field, then add the trigger tag; Walter's workflow does the rest. Oldest first per person,
// at least 30 s apart, so his workflow clears the tag before the next one and
// trial_converted always lands before a later canceled.

import * as Sentry from "@sentry/nextjs";
import { GhlError, type GhlClient } from "@/lib/ghl/client";
import {
  CRM_MIN_GAP_MS,
  CRM_NOTE_ONLY,
  CRM_EXTRA_TAGS,
  CRM_TRIGGER_TAG,
  firstTouchUtm,
  parseUtmCookie,
  type Utm,
  isCrmEvent,
  signupReferralFields,
} from "@/lib/crm";
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

/**
 * Sign-up through a friend's link (24 Nov): the code and the referrer's business name, read at
 * send time (the referral is claimed just after the sign-up is queued).
 */
async function signupReferral(
  db: ServiceClient,
  orgId: string | null,
): Promise<Record<string, string>> {
  if (!orgId) return {};
  const { data: ref } = await db
    .from("referrals")
    .select("code, referrer_org_id")
    .eq("referred_org_id", orgId)
    .maybeSingle();
  if (!ref) return {};
  const { data: brand } = await db
    .from("tenants")
    .select("name")
    .eq("organization_id", ref.referrer_org_id)
    .eq("name_pending", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return signupReferralFields({ code: ref.code, referrerName: brand?.name ?? null });
}

/**
 * Walter's rule for referral_rewarded: the referrer's and the friend's events for the same
 * referral at least 30 s apart. When the other side went out less than 30 s ago, this one waits.
 */
async function referralGapWait(db: ServiceClient, row: Row, now: Date): Promise<Date | null> {
  const referralId = (row.details as { referral_id?: unknown } | null)?.referral_id;
  if (row.event !== "referral_rewarded" || typeof referralId !== "string") return null;
  const since = new Date(now.getTime() - CRM_MIN_GAP_MS).toISOString();
  const { data } = await db
    .from("crm_events")
    .select("sent_at")
    .eq("event", "referral_rewarded")
    .eq("status", "sent")
    .neq("id", row.id)
    .like("dedupe_key", `referral_rewarded:${referralId}:%`)
    .gt("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1);
  const sentAt = data?.[0]?.sent_at;
  return sentAt ? new Date(new Date(sentAt).getTime() + CRM_MIN_GAP_MS) : null;
}

/** A note queued with the event (details.note = { title, body }), if any. */
function noteOf(details: unknown): { title: string; body: string } | null {
  const n = (details as { note?: { title?: unknown; body?: unknown } } | null)?.note;
  return n && typeof n.title === "string" && typeof n.body === "string"
    ? { title: n.title, body: n.body }
    : null;
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
    const gapUntil = await referralGapWait(db, row, now);
    if (gapUntil) {
      await db
        .from("crm_events")
        .update({ next_attempt_at: gapUntil.toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
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
      const note = noteOf(row.details);
      let contactId: string;
      if (CRM_NOTE_ONLY.has(row.event)) {
        // A note only (feedback, page ratings): the contact by email, no fields, no tag.
        ({ contactId } = await client.upsertContact({
          email: contact.email,
          name: contact.name,
          fields: {},
        }));
      } else {
        const snapshot = await loadSnapshot(db, { ...row, event: row.event }, now);
        // Sign-up also carries the first campaign, never over one the contact already has.
        const raw = (row.details as { utm?: unknown } | null)?.utm;
        const visit: Utm | null = parseUtmCookie(typeof raw === "string" ? raw : null);
        const utm = visit ? firstTouchUtm(visit, await client.contactFields(contact.email)) : {};
        // A friend's link: its code and who sent them, always (the link is what brought them).
        const referral =
          row.event === "signed_up" ? await signupReferral(db, row.organization_id) : {};
        ({ contactId } = await client.upsertContact({
          email: contact.email,
          name: contact.name,
          companyName: snapshot.business || null,
          fields: { ...crmFields(snapshot), ...(utm as Record<string, string>), ...referral },
        }));
        const extra = CRM_EXTRA_TAGS[row.event];
        await client.addTags(contactId, extra ? [CRM_TRIGGER_TAG, extra] : [CRM_TRIGGER_TAG]);
      }
      if (note) await client.addNote(contactId, note);
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
