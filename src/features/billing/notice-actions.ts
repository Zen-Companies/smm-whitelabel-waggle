"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { auditOrg } from "./billing-store";

// What people do with the plan pop-ups and banners (Walter's flow, 20 Nov), for the audit log
// (rule 11): the welcome pop-up closed, an upgrade offer closed, Try Solo hidden for 3 days.
// Fire and forget from the browser: never blocks the page, never says anything back.

const input = z.object({
  orgId: z.uuid(),
  what: z.enum(["welcome_closed", "offer_closed", "nudge_hidden", "out_closed"]),
  reason: z
    .string()
    .regex(/^[a-z_]{1,32}$/)
    .optional(),
});

export async function recordPlanNotice(raw: {
  orgId: string;
  what: "welcome_closed" | "offer_closed" | "nudge_hidden" | "out_closed";
  reason?: string;
}): Promise<void> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return;
  const { orgId, what, reason } = parsed.data;
  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return;
  await auditOrg(db, orgId, `billing.${what}`, user.id, reason ? { reason } : {});
}
