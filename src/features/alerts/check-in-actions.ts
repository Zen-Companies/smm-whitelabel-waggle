"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

// Settings → Tell me when: the morning-after email (first connect, 20 Nov) on or off. The
// person's own choice, saved with their own client (RLS: their rows only).

export type CheckInState = { error?: string; saved?: string };

export async function saveCheckInEmails(
  _prev: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const on = formData.get("checkIn") === "on";
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();
  const { error } = on
    ? await supabase.from("email_opt_outs").delete().eq("user_id", user.id).eq("kind", "check_in")
    : await supabase
        .from("email_opt_outs")
        .upsert(
          { user_id: user.id, kind: "check_in" },
          { onConflict: "user_id,kind", ignoreDuplicates: true },
        );
  if (error) return { error: "Couldn't save. Please try again." };
  const tenant = await getCurrentTenant();
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "check_in_emails_changed",
    actor: user.id,
    details: { on },
  });
  revalidatePath("/settings/notifications");
  return { saved: on ? "Saved: on." : "Saved: off." };
}
