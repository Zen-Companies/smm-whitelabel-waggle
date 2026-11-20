import { platformLabel } from "@/lib/social/platforms";
import { getServiceClient } from "@/lib/supabase/service";
import { sendingProgressAction } from "./actions";
import { loadSendingProgress } from "./send-schedule";
import { SendingProgressCard } from "./sending-progress-card";

/**
 * "Sending N of M…" where the owner approves (Inbox and Today): the brand's approved replies
 * going out spaced (20 Nov). Nothing while fewer than two are in the round.
 */
export async function SendingProgress({ tenantId }: { tenantId: string }) {
  const db = getServiceClient();
  const [initial, { data: account }] = await Promise.all([
    loadSendingProgress(db, tenantId).catch(() => null),
    db
      .from("social_accounts")
      .select("platform")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return (
    <SendingProgressCard
      initial={initial}
      platform={platformLabel(account?.platform ?? "instagram")}
      load={sendingProgressAction}
    />
  );
}
