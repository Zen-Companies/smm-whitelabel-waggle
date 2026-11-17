import "server-only";
import * as Sentry from "@sentry/nextjs";
import { planAllowsFollowUps } from "@/features/billing";
import { writeAudit } from "@/lib/audit";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  followupDue,
  followupSteps,
  isFollowupPlatform,
  type FollowupSettingsInput,
} from "./quiet-leads";

// Follow-ups for leads that go quiet (design "Billing round 2" §4, approved 18 Nov). Saving the
// owner's follow-up makes one Zernio sequence per Instagram, Facebook and WhatsApp account (one
// step, stops when they reply); the jobs route adds each quiet lead to its account's sequence
// once. No AI. Zernio bills $0.002 per enrollment after 2,000 a month.

/** Zernio sequences Waggle made for this, kept out of the owner's own Sequences list. */
export const FOLLOWUP_SEQUENCE_NAME = "Waggle · follow up quiet leads";

export interface FollowupSettingsRow {
  enabled: boolean;
  waitMinutes: number;
  message: string;
  whatsappTemplate: FollowupSettingsInput["whatsappTemplate"];
  sequences: Record<string, string>;
}

export async function loadFollowupSettings(
  db: ServiceClient,
  tenantId: string,
): Promise<FollowupSettingsRow | null> {
  const { data } = await db
    .from("followup_settings")
    .select("enabled, wait_minutes, message, whatsapp_template, sequences")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    enabled: data.enabled,
    waitMinutes: data.wait_minutes,
    message: data.message,
    whatsappTemplate: (data.whatsapp_template as FollowupSettingsRow["whatsappTemplate"]) ?? null,
    sequences: (data.sequences as Record<string, string>) ?? {},
  };
}

/**
 * Saves the owner's follow-up and remakes its Zernio sequences: one is made (and switched on when
 * enabled) per active Instagram, Facebook or WhatsApp account (WhatsApp only with a template),
 * the row is saved, and only then are the old sequences removed, so a failure halfway never
 * leaves the row pointing at deleted sequences. Returns how many accounts it covers.
 */
export async function saveFollowups(
  deps: { db: ServiceClient; social: SocialProvider },
  input: { tenantId: string; profileId: string; actor: string; settings: FollowupSettingsInput },
): Promise<{ accounts: number }> {
  const { db, social } = deps;
  const before = await loadFollowupSettings(db, input.tenantId);
  const { data: accounts } = await db
    .from("social_accounts")
    .select("platform, zernio_account_id")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active");
  const sequences: Record<string, string> = {};
  try {
    for (const a of accounts ?? []) {
      if (!isFollowupPlatform(a.platform)) continue;
      const steps = followupSteps(a.platform, input.settings);
      if (!steps) continue;
      const { id } = await social.createSequence({
        profileId: input.profileId,
        accountId: a.zernio_account_id,
        platform: a.platform,
        name: FOLLOWUP_SEQUENCE_NAME,
        steps,
        exitOnReply: true,
        exitOnUnsubscribe: true,
        signal: AbortSignal.timeout(15_000),
      });
      sequences[a.zernio_account_id] = id;
      if (input.settings.enabled) {
        await social.setSequenceActive({ id, active: true, signal: AbortSignal.timeout(15_000) });
      }
    }
  } catch (e) {
    // Undo what was made; the saved settings and the old sequences stay as they were.
    for (const id of Object.values(sequences)) {
      await social
        .deleteSequence({ id, signal: AbortSignal.timeout(15_000) })
        .catch(() => undefined);
    }
    throw e;
  }
  const { error } = await db.from("followup_settings").upsert({
    tenant_id: input.tenantId,
    enabled: input.settings.enabled,
    wait_minutes: input.settings.waitMinutes,
    message: input.settings.message,
    whatsapp_template: input.settings.whatsappTemplate as unknown as Json,
    sequences,
    updated_at: new Date().toISOString(),
    updated_by: input.actor,
  });
  if (error) throw new Error(`followups save failed: ${error.message}`);
  for (const id of Object.values(before?.sequences ?? {})) {
    // Pause first (so it can't keep sending if the delete fails), then delete.
    await social
      .setSequenceActive({ id, active: false, signal: AbortSignal.timeout(15_000) })
      .catch(() => undefined);
    await social
      .deleteSequence({ id, signal: AbortSignal.timeout(15_000) })
      .catch((e) => Sentry.captureException(e, { extra: { step: "followups:delete" } }));
  }
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "followups_saved",
    actor: input.actor,
    details: {
      enabled: input.settings.enabled,
      waitMinutes: input.settings.waitMinutes,
      accounts: Object.keys(sequences).length,
    },
  });
  return { accounts: Object.keys(sequences).length };
}

type LeadRow = {
  id: string;
  stage: string | null;
  inbound_items: {
    kind: string;
    conversation_id: string | null;
    social_accounts: { platform: string; zernio_account_id: string; status: string } | null;
    conversations: {
      id: string;
      followed_up_at: string | null;
      last_customer_message_at: string | null;
      zernio_contact_id: string | null;
    } | null;
  } | null;
};

/**
 * The jobs route: for each brand with follow-ups on (not offboarded, on a plan that includes
 * them), sends one follow-up per conversation that went quiet: the conversation is claimed first
 * (so two runs, or two leads in one thread, can't send twice), never when any lead in it is booked
 * or done, only through a connected account. A failed add is retried only when Zernio clearly
 * refused it; a timeout or 5xx may have gone through, so the claim stays (rule 7).
 */
export async function sendQuietLeadFollowUps(deps: {
  db: ServiceClient;
  social: () => SocialProvider;
  now?: Date;
  shouldContinue?: () => boolean;
}): Promise<{ sent: number; failed: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  let sent = 0;
  let failed = 0;
  const { data: brands } = await db
    .from("followup_settings")
    .select("tenant_id, wait_minutes, whatsapp_template, sequences, tenants!inner (offboarded_at)")
    .eq("enabled", true)
    .is("tenants.offboarded_at", null);
  for (const b of brands ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    if (!(await planAllowsFollowUps(db, b.tenant_id))) continue;
    const sequences = (b.sequences as Record<string, string>) ?? {};
    const since = new Date(now.getTime() - 8 * 24 * 60 * 60_000).toISOString();
    const { data } = await db
      .from("leads")
      .select(
        "id, stage, inbound_items (kind, conversation_id, " +
          "social_accounts (platform, zernio_account_id, status), " +
          "conversations (id, followed_up_at, last_customer_message_at, zernio_contact_id))",
      )
      .eq("tenant_id", b.tenant_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    // One entry per conversation, with every lead in it.
    const threads = new Map<string, { leads: LeadRow[]; first: LeadRow }>();
    for (const l of (data ?? []) as unknown as LeadRow[]) {
      const conv = l.inbound_items?.conversations;
      if (l.inbound_items?.kind !== "dm" || !conv) continue;
      const t = threads.get(conv.id);
      if (t) t.leads.push(l);
      else threads.set(conv.id, { leads: [l], first: l });
    }
    for (const [convId, thread] of threads) {
      if (deps.shouldContinue && !deps.shouldContinue()) break;
      const item = thread.first.inbound_items!;
      const conv = item.conversations!;
      const account = item.social_accounts;
      if (!account || account.status !== "active" || conv.followed_up_at) continue;
      // Booked or done anywhere in the thread: no follow-up.
      if (thread.leads.some((l) => l.stage === "booked" || l.stage === "done")) continue;
      const sequenceId = sequences[account.zernio_account_id];
      if (!sequenceId) continue;
      // Our latest sent reply in that conversation.
      const { data: ours } = await db
        .from("drafts")
        .select("sent_at, inbound_items!inner (conversation_id)")
        .eq("tenant_id", b.tenant_id)
        .eq("inbound_items.conversation_id", convId)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1);
      const due = followupDue(
        {
          platform: account.platform,
          stage: thread.first.stage,
          followedUpAt: conv.followed_up_at,
          lastCustomerAt: conv.last_customer_message_at
            ? new Date(conv.last_customer_message_at)
            : null,
          lastOursAt: ours?.[0]?.sent_at ? new Date(ours[0].sent_at) : null,
          hasContact: !!conv.zernio_contact_id,
          hasTemplate: !!b.whatsapp_template,
        },
        b.wait_minutes,
        now,
      );
      if (!due) continue;
      // Claim the conversation first, so nothing can send it twice.
      const { data: claimed } = await db
        .from("conversations")
        .update({ followed_up_at: now.toISOString() })
        .eq("id", convId)
        .eq("tenant_id", b.tenant_id)
        .is("followed_up_at", null)
        .select("id");
      if (!claimed?.length) continue;
      const leadIds = thread.leads.map((l) => l.id);
      try {
        const r = await deps.social().enrollInSequence({
          id: sequenceId,
          contactIds: [conv.zernio_contact_id!],
          signal: AbortSignal.timeout(15_000),
        });
        if (r.enrolled > 0) sent++;
        else failed++;
        // The Leads board shows "Follow-up sent" on the thread's leads.
        await db.from("leads").update({ followed_up_at: now.toISOString() }).in("id", leadIds);
        await writeAudit(db, {
          tenantId: b.tenant_id,
          action: "lead_followed_up",
          actor: "system",
          details: { conversationId: convId, leads: leadIds.length, enrolled: r.enrolled > 0 },
        });
      } catch (e) {
        failed++;
        const ambiguous = e instanceof SocialProviderError ? e.details.ambiguous : true;
        // Clearly refused: free it, so the next run can try again inside the window. A timeout
        // or 5xx may have gone through: keep the claim rather than risk a second message.
        if (!ambiguous) {
          await db.from("conversations").update({ followed_up_at: null }).eq("id", convId);
        }
        await writeAudit(db, {
          tenantId: b.tenant_id,
          action: "lead_follow_up_failed",
          actor: "system",
          details: { conversationId: convId, retry: !ambiguous },
        });
        Sentry.captureException(e, {
          extra: { tenantId: b.tenant_id, conversationId: convId, step: "followups:enroll" },
        });
      }
    }
  }
  return { sent, failed };
}
