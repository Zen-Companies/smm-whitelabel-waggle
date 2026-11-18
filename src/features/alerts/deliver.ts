import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { leadConsented } from "@/lib/social/lead-consent";
import { composeAlert, type AlertContent } from "./compose";
import {
  composeDigest,
  digestDue,
  digestLine,
  IMMEDIATE_KINDS,
  isFrequency,
  type DigestLine,
  type Frequency,
} from "./digest";
import type { Mailer } from "@/lib/email/mailer";

// Sends queued alerts (the `alerts` outbox, filled by DB triggers and the nudge sweep). Runs in
// the job route; webhooks never send (rule 3). Each alert is one email to the tenant's owners.

export const ALERT_BATCH_SIZE = 20;
export const ALERT_MAX_ATTEMPTS = 5;

export interface DeliverDeps {
  db: ServiceClient;
  mailer: Mailer;
  appUrl: string;
  now?: () => Date;
  shouldContinue?: () => boolean;
  /** Tests: only this tenant's alerts. */
  tenantId?: string;
}

export interface DeliverSummary {
  sent: number;
  logged: number;
  retried: number;
  failed: number;
  /** Alerts that went only into people's summaries. */
  batched: number;
}

type AlertRow = {
  id: string;
  tenant_id: string;
  kind: "escalation" | "lead" | "disconnect" | "draft_waiting" | "ad_lead" | "rcs_status";
  item_id: string | null;
  social_account_id: string | null;
  lead_id: string | null;
  details: Json;
  attempts: number;
};

class PermanentAlertError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PermanentAlertError";
  }
}

/** Why the item was escalated, from its last status_changed audit row (reason codes only). */
async function escalationReasonOf(db: ServiceClient, itemId: string, status: string) {
  const { data } = await db
    .from("audit_log")
    .select("details")
    .eq("item_id", itemId)
    .eq("action", "status_changed")
    .eq("details->>to", status)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const d = (data?.details ?? {}) as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "string" ? v : null);
  if (d.reason === "fail") return "retries_exhausted";
  if (d.reason === "delivery_failed") return "delivery_failed";
  return pick(d.policyReason) ?? pick(d.sendReason) ?? null;
}

async function itemSummary(db: ServiceClient, itemId: string) {
  const { data } = await db
    .from("inbound_items")
    .select("id, kind, author_name, category, status, social_accounts (platform)")
    .eq("id", itemId)
    .maybeSingle();
  if (!data) throw new PermanentAlertError("item_gone");
  const row = data as unknown as {
    id: string;
    kind: "comment" | "dm" | "review" | "call";
    author_name: string | null;
    category: string | null;
    status: string;
    social_accounts: { platform: string } | null;
  };
  return { ...row, platform: row.social_accounts?.platform ?? "instagram" };
}

/** The answers live in the stored lead.received event (T78d), never in the alert itself. */
async function adLeadContent(db: ServiceClient, alert: AlertRow): Promise<AlertContent> {
  const eventId = (alert.details as { eventId?: unknown } | null)?.eventId;
  if (typeof eventId !== "string") throw new PermanentAlertError("event_missing");
  const { data: event } = await db
    .from("webhook_events")
    .select("payload")
    .eq("id", eventId)
    .maybeSingle();
  const lead = (event?.payload as { lead?: Record<string, unknown> } | null)?.lead;
  if (!lead) throw new PermanentAlertError("event_gone");
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries((lead.fields ?? {}) as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") fields[k] = String(v).slice(0, 500);
    else if (Array.isArray(v)) fields[k] = v.map(String).join(", ").slice(0, 500);
  }
  const consents = Array.isArray(lead.consents)
    ? (lead.consents as { checkboxKey: string; isChecked: boolean }[])
    : [];
  return {
    kind: "ad_lead",
    formName: typeof lead.formName === "string" ? lead.formName : null,
    fields,
    agreedToMessages: leadConsented(consents),
  };
}

async function contentOf(db: ServiceClient, alert: AlertRow): Promise<AlertContent> {
  switch (alert.kind) {
    case "escalation": {
      const item = await itemSummary(db, alert.item_id!);
      return {
        kind: "escalation",
        itemId: item.id,
        itemKind: item.kind,
        platform: item.platform,
        authorName: item.author_name,
        category: item.category,
        status: item.status,
        reason: await escalationReasonOf(db, item.id, item.status),
      };
    }
    case "lead": {
      const [item, { data: lead }] = await Promise.all([
        itemSummary(db, alert.item_id!),
        db.from("leads").select("name, contact, request").eq("id", alert.lead_id!).maybeSingle(),
      ]);
      if (!lead) throw new PermanentAlertError("lead_gone");
      return {
        kind: "lead",
        itemId: item.id,
        itemKind: item.kind,
        platform: item.platform,
        authorName: item.author_name,
        ...lead,
      };
    }
    case "ad_lead":
      return adLeadContent(db, alert);
    case "rcs_status": {
      const d = (alert.details ?? {}) as { status?: unknown; reason?: unknown };
      const status = d.status;
      if (
        status !== "changes_requested" &&
        status !== "testing" &&
        status !== "live" &&
        status !== "rejected"
      ) {
        throw new PermanentAlertError("bad_status");
      }
      return {
        kind: "rcs_status",
        status,
        reason: typeof d.reason === "string" ? d.reason : null,
      };
    }
    case "disconnect": {
      const { data: account } = await db
        .from("social_accounts")
        .select("platform, username")
        .eq("id", alert.social_account_id!)
        .maybeSingle();
      if (!account) throw new PermanentAlertError("account_gone");
      return { kind: "disconnect", platform: account.platform, username: account.username };
    }
    case "draft_waiting": {
      const ids = (alert.details as { draftIds?: unknown[] } | null)?.draftIds ?? [];
      return { kind: "draft_waiting", count: Math.max(1, ids.length) };
    }
  }
}

/**
 * Who gets an alert (T55): everyone who can act on it. A lost connection goes to owners and
 * admins (they reconnect); messages to owners, admins and members (they approve). Viewers get
 * none. Addresses come from auth.users via the admin API.
 */
async function recipients(
  db: ServiceClient,
  tenantId: string,
  kind: string,
): Promise<{ userId: string; email: string }[]> {
  // Connections and paid channels (RCS) are set up by owners and admins.
  const roles =
    kind === "disconnect" || kind === "rcs_status"
      ? ["owner", "admin"]
      : ["owner", "admin", "member"];
  const { data: members, error } = await db
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", roles);
  if (error) throw new Error(`owner lookup failed: ${error.message}`);
  const out: { userId: string; email: string }[] = [];
  for (const m of members ?? []) {
    const { data } = await db.auth.admin.getUserById(m.user_id);
    if (data.user?.email) out.push({ userId: m.user_id, email: data.user.email });
  }
  return out;
}

/** Each person's choice, else the site default (design "Waggle emails", 18 Nov). */
export async function emailFrequencies(
  db: ServiceClient,
  userIds: string[],
): Promise<Map<string, Frequency>> {
  const [{ data: site }, { data: prefs }] = await Promise.all([
    db.from("email_settings").select("default_frequency").eq("id", true).maybeSingle(),
    userIds.length
      ? db.from("notification_prefs").select("user_id, email_frequency").in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string; email_frequency: string }[] }),
  ]);
  const fallback: Frequency = isFrequency(site?.default_frequency)
    ? site.default_frequency
    : "hourly";
  const out = new Map<string, Frequency>();
  for (const id of userIds) out.set(id, fallback);
  for (const p of prefs ?? []) {
    if (isFrequency(p.email_frequency)) out.set(p.user_id, p.email_frequency);
  }
  return out;
}

export async function deliverPendingAlerts(deps: DeliverDeps): Promise<DeliverSummary> {
  const { db, mailer } = deps;
  const now = deps.now?.() ?? new Date();
  const summary: DeliverSummary = { sent: 0, logged: 0, retried: 0, failed: 0, batched: 0 };

  let query = db
    .from("alerts")
    .select("id, tenant_id, kind, item_id, social_account_id, lead_id, details, attempts")
    .eq("status", "pending")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`);
  if (deps.tenantId) query = query.eq("tenant_id", deps.tenantId);
  const { data: due, error } = await query.order("created_at").limit(ALERT_BATCH_SIZE);
  if (error) throw new Error(`alerts lookup failed: ${error.message}`);

  for (const alert of (due ?? []) as AlertRow[]) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    // Claim: only one run handles an alert attempt (the Idempotency-Key also guards the send).
    const { data: claimed } = await db
      .from("alerts")
      .update({ attempts: alert.attempts + 1, next_attempt_at: null })
      .eq("id", alert.id)
      .eq("status", "pending")
      .eq("attempts", alert.attempts)
      .select("id");
    if (!claimed?.length) continue;
    const attempts = alert.attempts + 1;

    try {
      const [content, people, { data: tenant }] = await Promise.all([
        contentOf(db, alert),
        recipients(db, alert.tenant_id, alert.kind),
        db.from("tenants").select("name, offboarded_at").eq("id", alert.tenant_id).single(),
      ]);
      // T21: nobody is told about a brand our team offboarded.
      if (tenant?.offboarded_at) throw new PermanentAlertError("brand_offboarded");
      if (people.length === 0) throw new PermanentAlertError("no_owner_email");

      // 18 Nov: people on "every hour" / "every 2 hours" get it in their summary instead.
      const line = IMMEDIATE_KINDS.has(alert.kind) ? null : digestLine(content, deps.appUrl);
      const freq = line
        ? await emailFrequencies(
            db,
            people.map((p) => p.userId),
          )
        : new Map<string, Frequency>();
      const later = line ? people.filter((p) => (freq.get(p.userId) ?? "now") !== "now") : [];
      const to = people.filter((p) => !later.includes(p)).map((p) => p.email);
      if (later.length) {
        const { error: queueError } = await db.from("alert_digest_entries").upsert(
          later.map((p) => ({
            user_id: p.userId,
            tenant_id: alert.tenant_id,
            alert_id: alert.id,
            content: line as unknown as Json,
          })),
          { onConflict: "user_id,alert_id", ignoreDuplicates: true },
        );
        if (queueError) throw new Error(`digest queue failed: ${queueError.message}`);
      }

      let mode: "sent" | "logged" | "batched" = "batched";
      let providerId: string | null = null;
      if (to.length) {
        const email = composeAlert(content, {
          businessName: tenant?.name ?? "Your business",
          appUrl: deps.appUrl,
        });
        const result = await mailer.send({ ...email, to, idempotencyKey: alert.id });
        mode = result.mode;
        providerId = result.providerId;
      }

      await db
        .from("alerts")
        .update({
          status: mode,
          sent_at: now.toISOString(),
          provider_id: providerId,
          last_error: null,
        })
        .eq("id", alert.id);
      await writeAudit(db, {
        tenantId: alert.tenant_id,
        itemId: alert.item_id,
        action: "alert_sent",
        actor: "system",
        details: { alertId: alert.id, kind: alert.kind, mode, batchedFor: later.length },
      });
      summary[mode] += 1;
    } catch (err) {
      const permanent = err instanceof PermanentAlertError;
      const message = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(
        0,
        500,
      );
      if (permanent || attempts >= ALERT_MAX_ATTEMPTS) {
        await db
          .from("alerts")
          .update({ status: "failed", last_error: message })
          .eq("id", alert.id);
        await writeAudit(db, {
          tenantId: alert.tenant_id,
          itemId: alert.item_id,
          action: "alert_failed",
          actor: "system",
          details: { alertId: alert.id, kind: alert.kind, error: message },
        });
        Sentry.captureException(err, { extra: { alertId: alert.id, kind: alert.kind } });
        summary.failed += 1;
      } else {
        await db
          .from("alerts")
          .update({
            last_error: message,
            next_attempt_at: new Date(now.getTime() + 2 ** attempts * 60_000).toISOString(),
          })
          .eq("id", alert.id);
        summary.retried += 1;
      }
    }
  }
  return summary;
}

export interface DigestSummary {
  sent: number;
  logged: number;
  failed: number;
}

/** A claim older than this is taken again (a run that died mid-send). */
const STALE_CLAIM_MS = 30 * 60_000;

/**
 * Sends the summaries that are due (design "Waggle emails", 18 Nov): one email per person and
 * business, once their oldest waiting entry has waited their interval. Claimed first so two runs
 * never send the same summary; the idempotency key also guards the send.
 */
export async function deliverDueDigests(deps: DeliverDeps): Promise<DigestSummary> {
  const { db, mailer } = deps;
  const now = deps.now?.() ?? new Date();
  const out: DigestSummary = { sent: 0, logged: 0, failed: 0 };
  const stale = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  let query = db
    .from("alert_digest_entries")
    .select("id, created_at, user_id, tenant_id, content")
    .is("sent_at", null)
    .or(`claimed_at.is.null,claimed_at.lt.${stale}`);
  if (deps.tenantId) query = query.eq("tenant_id", deps.tenantId);
  const { data: waiting, error } = await query.order("created_at").limit(1000);
  if (error) throw new Error(`digest lookup failed: ${error.message}`);
  if (!waiting?.length) return out;

  const groups = new Map<string, typeof waiting>();
  for (const e of waiting) {
    const key = `${e.user_id}|${e.tenant_id}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const freq = await emailFrequencies(db, [...new Set(waiting.map((e) => e.user_id))]);

  for (const entries of groups.values()) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    const { user_id: userId, tenant_id: tenantId } = entries[0];
    // Someone who switched to "right away" gets what's waiting now.
    if (!digestDue(new Date(entries[0].created_at), freq.get(userId) ?? "hourly", now)) continue;
    const ids = entries.map((e) => e.id);
    const { data: claimed } = await db
      .from("alert_digest_entries")
      .update({ claimed_at: now.toISOString() })
      .in("id", ids)
      .is("sent_at", null)
      .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
      .select("id");
    const mine = new Set((claimed ?? []).map((c) => c.id));
    const lines = entries
      .filter((e) => mine.has(e.id))
      .map((e) => e.content as unknown as DigestLine);
    if (!lines.length) continue;
    try {
      const [{ data: user }, { data: tenant }] = await Promise.all([
        db.auth.admin.getUserById(userId),
        db.from("tenants").select("name, offboarded_at").eq("id", tenantId).single(),
      ]);
      const email = user.user?.email;
      const done = { sent_at: now.toISOString() };
      if (!email || tenant?.offboarded_at) {
        await db
          .from("alert_digest_entries")
          .update(done)
          .in("id", [...mine]);
        continue;
      }
      const composed = composeDigest(lines, {
        businessName: tenant?.name ?? "Your business",
        appUrl: deps.appUrl,
      });
      const result = await mailer.send({
        ...composed,
        to: [email],
        idempotencyKey: `digest-${[...mine].sort()[0]}-${mine.size}`,
      });
      await db
        .from("alert_digest_entries")
        .update(done)
        .in("id", [...mine]);
      await writeAudit(db, {
        tenantId,
        action: "alert_digest_sent",
        actor: "system",
        details: { userId, entries: mine.size, mode: result.mode },
      });
      out[result.mode] += 1;
    } catch (err) {
      // Released for the next run.
      await db
        .from("alert_digest_entries")
        .update({ claimed_at: null })
        .in("id", [...mine]);
      Sentry.captureException(err, { extra: { userId, tenantId, step: "digest" } });
      out.failed += 1;
    }
  }
  return out;
}
