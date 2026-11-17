import { brandSwitchOn } from "@/lib/flags/brand-switch";
import type { ServiceClient } from "@/lib/supabase/service";

/** Messaging (RCS, iMessage) is off until staff switch it on for the brand (T83). */
export async function messagingOn(db: ServiceClient, tenantId: string): Promise<boolean> {
  return brandSwitchOn(db, "messaging", tenantId);
}
