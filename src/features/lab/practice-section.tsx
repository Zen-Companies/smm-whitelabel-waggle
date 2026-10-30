import { getCurrentTenant } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { PracticeBox } from "./practice-box";
import { practiceTriesLeft } from "./practice-limit";

/** Settings → Replies: the owner's practice box (T26) with today's remaining tries. */
export async function PracticeSection() {
  const tenant = await getCurrentTenant();
  return <PracticeBox triesLeft={await practiceTriesLeft(getServiceClient(), tenant.id)} />;
}
