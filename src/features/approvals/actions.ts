"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentTenant } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { AUTONOMY_MODES, CONFIGURABLE_CATEGORIES } from "./autonomy";

export interface AutonomyFormState {
  error?: string;
  saved?: boolean;
}

const schema = z.object({
  category: z.enum(CONFIGURABLE_CATEGORIES),
  mode: z.enum(AUTONOMY_MODES),
});

/** Owner changes a category's mode (PRD F9). Applies to the next item in that category. */
export async function updateAutonomyMode(
  _prev: AutonomyFormState,
  formData: FormData,
): Promise<AutonomyFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a valid mode." };
  const { category, mode } = parsed.data;
  const tenant = await getCurrentTenant();

  // Through RLS: the owner may update `mode` on their own tenant's rows only.
  const supabase = await createServerSupabase();
  const { data: before } = await supabase
    .from("autonomy_settings")
    .select("mode")
    .eq("tenant_id", tenant.id)
    .eq("category", category)
    .single();
  const { data, error } = await supabase
    .from("autonomy_settings")
    .update({ mode })
    .eq("tenant_id", tenant.id)
    .eq("category", category)
    .select("mode");
  if (error || !data?.length) return { error: "Couldn't save. Please try again." };

  if (before?.mode !== mode) {
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "autonomy_mode_changed",
      actor: tenant.userId,
      details: { category, from: before?.mode ?? null, to: mode },
    });
  }
  revalidatePath("/settings");
  return { saved: true };
}
