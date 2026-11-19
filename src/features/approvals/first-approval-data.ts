import "server-only";
import { loadReplyLimit } from "@/features/billing";
import { platformLabel } from "@/lib/social/platforms";
import type { ServiceClient } from "@/lib/supabase/service";
import { firstApprovalCopy, type FirstApproval } from "./first-approval";

// The first approval's in-place moment (first-approval.ts has the words). Ids only in errors.

/** The organization's brands, from one of them. */
export async function orgBrandIds(
  db: ServiceClient,
  tenantId: string,
): Promise<{ orgId: string; tenantIds: string[] } | null> {
  const { data: tenant } = await db
    .from("tenants")
    .select("organization_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.organization_id) return null;
  const { data: brands } = await db
    .from("tenants")
    .select("id")
    .eq("organization_id", tenant.organization_id);
  return { orgId: tenant.organization_id, tenantIds: (brands ?? []).map((b) => b.id) };
}

/**
 * Right after an approval: the moment's words if this is the organization's first approved
 * reply (no other reply of theirs approved or sent, the owner's own included), else null.
 * Never throws: the approval already happened, the moment is a nicety.
 */
export async function loadFirstApproval(
  db: ServiceClient,
  input: { tenantId: string; itemId: string; draftId: string; now?: Date },
): Promise<FirstApproval | null> {
  try {
    const now = input.now ?? new Date();
    const org = await orgBrandIds(db, input.tenantId);
    if (!org) return null;
    const { count: earlier } = await db
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .in("tenant_id", org.tenantIds)
      .not("decided_by", "is", null)
      .in("status", ["approved", "sent"])
      .neq("id", input.draftId);
    if ((earlier ?? 1) > 0) return null;

    const [{ data: item }, { data: draft }, waiting, limit] = await Promise.all([
      db
        .from("inbound_items")
        .select("kind, author_name, received_at, social_accounts!inner (platform)")
        .eq("id", input.itemId)
        .eq("tenant_id", input.tenantId)
        .maybeSingle(),
      db.from("drafts").select("owner_written").eq("id", input.draftId).maybeSingle(),
      db
        .from("inbound_items")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("status", "awaiting_approval")
        .order("received_at", { ascending: false })
        .limit(500),
      loadReplyLimit(db, org.orgId, now).catch(() => null),
    ]);
    if (!item) return null;
    const next = waiting.data?.[0]?.id ?? null;
    // Only sent replies count toward the plan; this one is on its way.
    const thisOne = draft && !draft.owner_written ? 1 : 0;
    return firstApprovalCopy({
      author: item.author_name,
      kind: item.kind,
      receivedAt: item.received_at,
      now,
      used: limit ? limit.limit.used + thisOne : null,
      allowance: limit ? limit.limit.allowance : null,
      free: limit?.plan.plan === "free",
      waiting: waiting.data?.length ?? 0,
      platform: platformLabel(item.social_accounts.platform),
      nextHref: next ? `/inbox/items/${next}` : "/inbox",
    });
  } catch {
    return null;
  }
}
