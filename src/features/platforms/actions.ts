"use server";

import { revalidatePath } from "next/cache";
import { hasPermission } from "@/features/staff";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { allowedStatuses, isPlatformStatus, STATUS_LABELS, SWITCHABLE } from "./catalog";
import { loadPlatformRows } from "./store";

export type PlatformsFormState = { error?: string; saved?: string };

/**
 * Staff → Platforms (approved 18 Nov): saves what owners see per platform. Admins with the plan
 * settings permission only, checked here too. Only changed rows are written, and each change is
 * kept with who made it (CLAUDE.md rule 11). Owners already connected are never disconnected.
 */
export async function updatePlatformStatuses(
  _prev: PlatformsFormState,
  formData: FormData,
): Promise<PlatformsFormState> {
  const user = await getCurrentUser();
  if (!(await hasPermission("admin.caps.manage"))) return { error: "Not available." };
  const db = getServiceClient();
  const current = await loadPlatformRows(db);
  const changed: string[] = [];
  const now = new Date().toISOString();
  for (const p of SWITCHABLE) {
    const value = formData.get(p.id);
    if (value === null) continue;
    if (!isPlatformStatus(value) || !allowedStatuses(p).includes(value)) {
      return { error: `${p.label} can't be ${String(value)}.` };
    }
    const before = current.get(p.id)?.status ?? null;
    if (before === value) continue;
    const { error } = await db
      .from("platform_settings")
      .upsert(
        { platform: p.id, status: value, updated_at: now, updated_by: user.id },
        { onConflict: "platform" },
      );
    if (error) return { error: "Couldn't save. Please try again." };
    await db
      .from("platform_settings_changes")
      .insert({ platform: p.id, changed_by: user.id, before, after: value });
    changed.push(`${p.label} is now ${STATUS_LABELS[value].toLowerCase()}`);
  }
  revalidatePath("/admin/platforms");
  revalidatePath("/settings", "layout");
  if (!changed.length) return { saved: "Nothing changed." };
  return { saved: `Saved. ${changed.join("; ")} for every business.` };
}
