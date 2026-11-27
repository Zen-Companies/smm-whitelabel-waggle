import type { ServiceClient } from "@/lib/supabase/service";
import { businessPhone } from "./google-post";

/**
 * The business phone Waggle has (Business info), for Google's Call now. Shared by the composer and
 * the AI assistants' preview, so both dial the same number.
 */
export async function loadBusinessPhone(
  db: ServiceClient,
  tenantId: string,
): Promise<string | null> {
  const { data } = await db
    .from("kb_entries")
    .select("title, content, found_kind")
    .eq("tenant_id", tenantId)
    .limit(500);
  return businessPhone(data ?? []);
}
