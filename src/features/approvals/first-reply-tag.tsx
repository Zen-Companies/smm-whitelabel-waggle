import {
  ConversionTag,
  conversionEventId,
  FIRST_REPLY_WINDOW_MS,
  matchKeys,
} from "@/features/ad-tracking";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

/** Where the organization's first approved reply goes, when it was approved under 48h ago. */
async function recentFirstReply(orgId: string): Promise<string | null> {
  const db = getServiceClient();
  const { data: brands } = await db.from("tenants").select("id").eq("organization_id", orgId);
  const ids = (brands ?? []).map((b) => b.id);
  if (ids.length === 0) return null;
  const { data: first } = await db
    .from("drafts")
    .select("decided_at, inbound_items!inner (social_accounts!inner (platform))")
    .in("tenant_id", ids)
    .not("decided_by", "is", null)
    .not("decided_at", "is", null)
    .in("status", ["approved", "sent"])
    .order("decided_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first?.decided_at) return null;
  const age = Date.now() - new Date(first.decided_at).getTime();
  return age >= 0 && age <= FIRST_REPLY_WINDOW_MS
    ? first.inbound_items.social_accounts.platform
    : null;
}

/**
 * FirstReplyApproved for the ads (first connect board, 20 Nov), like FirstConnectTag: once, for
 * an Owner, on the page after the organization's first approved reply (the approval refreshes
 * the page). One event id per organization, so it counts once however many pages or browsers see
 * it. HighLevel gets first_reply_approved from approveDraft.
 */
export async function FirstReplyTag({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  if (!isOwner) return null;
  const platform = await recentFirstReply(orgId);
  if (!platform) return null;
  const user = await getCurrentUser();
  const keys = matchKeys(user.id, user.email);
  return (
    <ConversionTag
      event="FirstReplyApproved"
      eventId={conversionEventId("FirstReplyApproved", orgId)}
      em={keys.em}
      externalId={keys.externalId}
      platform={platform}
    />
  );
}
