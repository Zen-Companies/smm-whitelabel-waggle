import {
  CONNECT_WINDOW_MS,
  ConversionTag,
  conversionEventId,
  matchKeys,
} from "@/features/ad-tracking";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

/** The platform of the organization's first connected account, when that was under 48h ago. */
async function recentFirstConnect(orgId: string): Promise<string | null> {
  const db = getServiceClient();
  const { data: brands } = await db.from("tenants").select("id").eq("organization_id", orgId);
  const ids = (brands ?? []).map((b) => b.id);
  if (ids.length === 0) return null;
  const { data: first } = await db
    .from("social_accounts")
    .select("platform, created_at")
    .in("tenant_id", ids)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first) return null;
  const age = Date.now() - new Date(first.created_at).getTime();
  return age >= 0 && age <= CONNECT_WINDOW_MS ? first.platform : null;
}

/**
 * ConnectAccount for the ads (Atlas, 19 Nov): once, for an Owner, in the first 48 hours after
 * the organization's first social account connected. The account arrives by Zernio's webhook, so
 * the tag fires on the next page the owner opens (setup or the app). One event id per
 * organization, so it counts once however many pages or browsers see it.
 */
export async function FirstConnectTag({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  if (!isOwner) return null;
  const platform = await recentFirstConnect(orgId);
  if (!platform) return null;
  const user = await getCurrentUser();
  const keys = matchKeys(user.id, user.email);
  return (
    <ConversionTag
      event="ConnectAccount"
      eventId={conversionEventId("ConnectAccount", orgId)}
      em={keys.em}
      externalId={keys.externalId}
      platform={platform}
    />
  );
}
