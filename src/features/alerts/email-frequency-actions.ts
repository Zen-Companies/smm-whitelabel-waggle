"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@/features/staff";
import { getCurrentTenant } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { FREQUENCY_LABELS, isFrequency } from "./digest";

// How often Waggle emails you (design "Waggle emails", approved 18 Nov).

export type FrequencyState = { error?: string; saved?: string };

/** Settings → Tell me when: the person's own choice, saved with their own client (RLS). */
export async function saveMyEmailFrequency(
  _prev: FrequencyState,
  formData: FormData,
): Promise<FrequencyState> {
  const value = formData.get("frequency");
  if (!isFrequency(value)) return { error: "Pick one of the choices." };
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("notification_prefs")
    .upsert(
      { user_id: user.id, email_frequency: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return { error: "Couldn't save. Please try again." };
  const tenant = await getCurrentTenant();
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "email_frequency_changed",
    actor: user.id,
    details: { frequency: value },
  });
  revalidatePath("/settings/notifications");
  return { saved: `Saved: ${FREQUENCY_LABELS[value].label.toLowerCase()}.` };
}

/** Staff → Switches: the default for everyone who hasn't picked. Kept with who changed it. */
export async function saveSiteEmailFrequency(
  _prev: FrequencyState,
  formData: FormData,
): Promise<FrequencyState> {
  if (!(await hasPermission("flags.manage"))) return { error: "Not available." };
  const value = formData.get("frequency");
  if (!isFrequency(value)) return { error: "Pick one of the choices." };
  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data: current } = await db
    .from("email_settings")
    .select("default_frequency")
    .eq("id", true)
    .maybeSingle();
  if (current?.default_frequency === value) return { saved: "Nothing changed." };
  const { error } = await db.from("email_settings").upsert(
    {
      id: true,
      default_frequency: value,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "id" },
  );
  if (error) return { error: "Couldn't save. Please try again." };
  await db.from("email_settings_changes").insert({
    changed_by: user.id,
    before: current?.default_frequency ?? null,
    after: value,
  });
  revalidatePath("/admin/switches");
  return {
    saved: `Saved: ${FREQUENCY_LABELS[value].label.toLowerCase()} for everyone who hasn't picked.`,
  };
}
