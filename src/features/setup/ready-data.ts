import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { readySteps, REPLIES_CHOSEN_ACTION, type ReadyStep } from "./checklist";

/**
 * The facts behind "Get Waggle ready" for one brand. Business data through RLS; practice tries
 * (lab_runs) with the service role by tenant id, since owners have no client access to that table.
 * Cached per request: setup, the Teach Waggle line and Today can all ask.
 */
export const loadReadySteps = cache(async (tenantId: string): Promise<ReadyStep[]> => {
  const supabase = await createServerSupabase();
  const [
    { data: tenant },
    { count: accounts },
    { count: answers },
    { count: tries },
    { data: chose },
  ] = await Promise.all([
    supabase.from("tenants").select("business_profile").eq("id", tenantId).single(),
    supabase
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    supabase
      .from("kb_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    getServiceClient()
      .from("lab_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("origin", "owner"),
    // Chosen in setup, or changed for questions in How Waggle replies.
    supabase
      .from("audit_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .or(
        `action.eq.${REPLIES_CHOSEN_ACTION},and(action.eq.autonomy_mode_changed,details->>category.eq.faq)`,
      )
      .limit(1),
  ]);
  return readySteps({
    hasProfile: !!tenant?.business_profile?.trim(),
    accounts: accounts ?? 0,
    answers: answers ?? 0,
    tries: tries ?? 0,
    repliesChosen: (chose?.length ?? 0) > 0,
  });
});
