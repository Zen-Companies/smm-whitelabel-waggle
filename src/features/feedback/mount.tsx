import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { eligibleNudges, loadEarlier } from "./server";
import { FeedbackWidget } from "./widget";

/** The Feedback button and panel for the signed-in person, on every page of the app. */
export async function Feedback({
  orgId,
  tenantId,
}: {
  orgId: string | null;
  tenantId: string | null;
}) {
  const user = await getCurrentUser();
  const db = getServiceClient();
  const [earlier, nudges] = await Promise.all([loadEarlier(db, user.id), eligibleNudges(db, user)]);
  return <FeedbackWidget orgId={orgId} tenantId={tenantId} earlier={earlier} nudges={nudges} />;
}
