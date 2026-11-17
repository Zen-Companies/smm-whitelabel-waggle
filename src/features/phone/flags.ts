import { brandSwitchOn } from "@/lib/flags/brand-switch";
import type { ServiceClient } from "@/lib/supabase/service";

/** Phone is off until staff switch it on for the brand (T82a; billing isn't built yet). */
export async function phoneOn(db: ServiceClient, tenantId: string): Promise<boolean> {
  return brandSwitchOn(db, "phone", tenantId);
}
