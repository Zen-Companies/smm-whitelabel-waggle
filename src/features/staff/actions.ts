"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/service";
import { addStaffMember, changeStaffRole, removeStaffMember } from "./members";
import { STAFF_ROLES } from "./permissions";
import { currentStaffAccess } from "./staff";

// Staff page actions (design v3 "Staff"). `staff.manage` is checked here too: a Server Action is
// reachable without the page.

export type StaffFormState = { saved?: boolean; error?: string };

const role = z.enum(STAFF_ROLES);

async function manager() {
  const access = await currentStaffAccess();
  return access.permissions.has("staff.manage") ? access.userId : null;
}

export async function addStaff(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const actor = await manager();
  if (!actor) return { error: "Not available." };
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter an email address." };
  const r = role.safeParse(formData.get("role"));
  if (!r.success) return { error: "Pick a role." };
  const out = await addStaffMember(getServiceClient(), actor, email.data, r.data);
  if ("error" in out) return { error: out.error };
  revalidatePath("/admin/staff");
  return { saved: true };
}

export async function changeRole(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await manager();
  if (!actor) return { error: "Not available." };
  const userId = z.uuid().safeParse(formData.get("userId"));
  const r = role.safeParse(formData.get("role"));
  if (!userId.success || !r.success) return { error: "Pick a role." };
  const out = await changeStaffRole(getServiceClient(), actor, userId.data, r.data);
  if ("error" in out) return { error: out.error };
  revalidatePath("/admin/staff");
  return { saved: true };
}

export async function removeStaff(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await manager();
  if (!actor) return { error: "Not available." };
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "That person wasn't found." };
  const out = await removeStaffMember(getServiceClient(), actor, userId.data);
  if ("error" in out) return { error: out.error };
  revalidatePath("/admin/staff");
  return { saved: true };
}
