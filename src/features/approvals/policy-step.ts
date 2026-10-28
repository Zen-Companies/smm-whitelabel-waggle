import type { Step, StatusEvent } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  policy,
  type AutonomyMode,
  type Category,
  type PolicyDecision,
  type PolicyInput,
  type SubscriptionStatus,
} from "./policy";

const EVENTS: Record<PolicyDecision["decision"], StatusEvent> = {
  send: "send",
  approve: "await_approval",
  escalate: "escalate",
  ignore: "ignore",
  pause: "pause",
};

/** Gathers the policy inputs for one drafted item. Throws if the item isn't ready (retried). */
export async function loadPolicyInput(
  db: ServiceClient,
  itemId: string,
  now: Date,
): Promise<{ input: PolicyInput; draftId: string | null }> {
  const { data: item, error } = await db
    .from("inbound_items")
    .select(
      "id, tenant_id, kind, category, confidence, conversation_id, " +
        "social_accounts!inner (status), tenants!inner (subscription_status, confidence_threshold)",
    )
    .eq("id", itemId)
    .single();
  if (error) throw new Error(`policy: item lookup failed: ${error.message}`);
  const row = item as unknown as {
    tenant_id: string;
    kind: "comment" | "dm";
    category: Category | null;
    confidence: number | null;
    conversation_id: string | null;
    social_accounts: { status: PolicyInput["account"]["status"] };
    tenants: { subscription_status: SubscriptionStatus; confidence_threshold: number };
  };
  if (!row.category || row.confidence === null) throw new Error("policy: item is not classified");

  const [{ data: setting }, { data: draft }, conversation] = await Promise.all([
    db
      .from("autonomy_settings")
      .select("mode")
      .eq("tenant_id", row.tenant_id)
      .eq("category", row.category)
      .maybeSingle(),
    db
      .from("drafts")
      .select("id, needs_human")
      .eq("item_id", itemId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    row.conversation_id
      ? db
          .from("conversations")
          .select("last_customer_message_at")
          .eq("id", row.conversation_id)
          .single()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  return {
    draftId: draft?.id ?? null,
    input: {
      item: { kind: row.kind },
      classification: { category: row.category, confidence: Number(row.confidence) },
      draft: draft ? { needsHuman: draft.needs_human } : null,
      tenant: {
        subscriptionStatus: row.tenants.subscription_status,
        confidenceThreshold: Number(row.tenants.confidence_threshold),
      },
      account: row.social_accounts,
      // A missing row means the default for a new category: the safest mode.
      autonomyMode: (setting?.mode as AutonomyMode | undefined) ?? "off",
      lastCustomerMessageAt: conversation?.last_customer_message_at
        ? new Date(conversation.last_customer_message_at)
        : null,
      now,
    },
  };
}

/** The `drafted` step: run policy() and turn its decision into the next status. */
export function createPolicyStep(opts: { now?: () => Date } = {}): Step {
  return async (item, ctx) => {
    const now = opts.now?.() ?? new Date();
    const { input, draftId } = await loadPolicyInput(ctx.db, item.id, now);
    const result = policy(input);

    if (result.decision === "send" && draftId) {
      // Auto mode: the policy approves the draft in the owner's place.
      await ctx.db
        .from("drafts")
        .update({ status: "approved", decided_at: now.toISOString() })
        .eq("id", draftId)
        .eq("status", "pending");
      await writeAudit(ctx.db, {
        tenantId: item.tenantId,
        itemId: item.id,
        action: "draft_auto_approved",
        actor: "system",
        details: { draftId },
      });
    }

    return {
      event: EVENTS[result.decision],
      details: {
        decision: result.decision,
        policyReason: result.reason,
        mode: input.autonomyMode,
        draftId,
      },
    };
  };
}
