import "server-only";
import * as Sentry from "@sentry/nextjs";
import { planAllowsFollowUps } from "@/features/billing";
import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social/types";
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
 * Saves the owner's follow-up and remakes its Zernio sequences: the old ones are deleted, and
 * one is made (and switched on when enabled) per active Instagram, Facebook or WhatsApp account
 * (WhatsApp only with a template). Returns how many accounts it covers.
 */
export async function saveFollowups(
  deps: { db: ServiceClient; social: SocialProvider },
  input: { tenantId: string; profileId: string; actor: string; settings: FollowupSettingsInput },
): Promise<{ accounts: number }> {
  const { db, social } = deps;
  const before = await loadFollowupSettings(db, input.tenantId);
  for (const id of Object.values(before?.sequences ?? {})) {
    await social
      .deleteSequence({ id, signal: AbortSignal.timeout(15_000) })
      .catch((e) => Sentry.captureException(e, { extra: { step: "followups:delete" } }));
  }
  const { data: accounts } = await db
    .from("social_accounts")
    .select("platform, zernio_account_id")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active");
  const sequences: Record<string, string> = {};
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
    if (input.settings.enabled) {
      await social.setSequenceActive({ id, active: true, signal: AbortSignal.timeout(15_000) });
    }
    sequences[a.zernio_account_id] = id;
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

type CandidateRow = {
  id: string;
  stage: string | null;
  followed_up_at: string | null;
  item_id: string;
  inbound_items: {
    kind: string;
    conversation_id: string | null;
    social_accounts: { platform: string; zernio_account_id: string } | null;
    conversations: {
      last_customer_message_at: string | null;
      zernio_contact_id: string | null;
    } | null;
  } | null;
};

/**
 * The jobs route: for each brand with follow-ups on (and a plan that includes them), adds each
 * lead that went quiet to its account's sequence, once, and marks it on the lead. Database and
 * Zernio only; no AI.
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
    .select("tenant_id, wait_minutes, whatsapp_template, sequences")
    .eq("enabled", true);
  for (const b of brands ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    if (!(await planAllowsFollowUps(db, b.tenant_id))) continue;
    const sequences = (b.sequences as Record<string, string>) ?? {};
    const since = new Date(now.getTime() - 8 * 24 * 60 * 60_000).toISOString();
    const { data } = await db
      .from("leads")
      .select(
        "id, stage, followed_up_at, item_id, inbound_items (kind, conversation_id, " +
          "social_accounts (platform, zernio_account_id), " +
          "conversations (last_customer_message_at, zernio_contact_id))",
      )
      .eq("tenant_id", b.tenant_id)
      .is("followed_up_at", null)
      .gte("created_at", since)
      .limit(200);
    const leads = ((data ?? []) as unknown as CandidateRow[]).filter(
      (l) => l.inbound_items?.kind === "dm" && l.inbound_items.conversation_id,
    );
    for (const l of leads) {
      if (deps.shouldContinue && !deps.shouldContinue()) break;
      const item = l.inbound_items!;
      const account = item.social_accounts;
      const conv = item.conversations;
      if (!account || !conv) continue;
      // Our latest sent reply in that conversation.
      const { data: ours } = await db
        .from("drafts")
        .select("sent_at, inbound_items!inner (conversation_id)")
        .eq("tenant_id", b.tenant_id)
        .eq("inbound_items.conversation_id", item.conversation_id!)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1);
      const lastOursAt = ours?.[0]?.sent_at ? new Date(ours[0].sent_at) : null;
      const due = followupDue(
        {
          platform: account.platform,
          stage: l.stage,
          followedUpAt: l.followed_up_at,
          lastCustomerAt: conv.last_customer_message_at
            ? new Date(conv.last_customer_message_at)
            : null,
          lastOursAt,
          hasContact: !!conv.zernio_contact_id,
          hasTemplate: !!b.whatsapp_template,
        },
        b.wait_minutes,
        now,
      );
      const sequenceId = sequences[account.zernio_account_id];
      if (!due || !sequenceId) continue;
      // Claim it first, so a second run can't send it again.
      const { data: claimed } = await db
        .from("leads")
        .update({ followed_up_at: now.toISOString() })
        .eq("id", l.id)
        .is("followed_up_at", null)
        .select("id");
      if (!claimed?.length) continue;
      try {
        const r = await deps.social().enrollInSequence({
          id: sequenceId,
          contactIds: [conv.zernio_contact_id!],
          signal: AbortSignal.timeout(15_000),
        });
        if (r.enrolled > 0) sent++;
        else failed++;
        await writeAudit(db, {
          tenantId: b.tenant_id,
          action: "lead_followed_up",
          actor: "system",
          details: { leadId: l.id, enrolled: r.enrolled > 0 },
        });
      } catch (e) {
        failed++;
        // Not sent: free the lead so the next run tries again (still inside the window).
        await db.from("leads").update({ followed_up_at: null }).eq("id", l.id);
        Sentry.captureException(e, {
          extra: { tenantId: b.tenant_id, leadId: l.id, step: "followups:enroll" },
        });
      }
    }
  }
  return { sent, failed };
}
