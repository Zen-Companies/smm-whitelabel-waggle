"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentStaffAccess } from "@/features/staff";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { offboardBrand, restoreBrand, retryOffboarding } from "./offboard";
import { nameMatches } from "./rows";
import { setTestBusiness } from "./test-business";

// Staff Brands page (T21). `brands.manage` (admins) is checked here too: a Server Action is
// reachable without the page.

export type BrandActionState = { done?: boolean; error?: string; issue?: string | null };

const id = z.uuid();

async function admin(): Promise<string | null> {
  const access = await currentStaffAccess();
  return access.permissions.has("brands.manage") ? access.userId : null;
}

const deps = () => ({ db: getServiceClient(), social: getSocialProvider });

export async function offboardAction(
  _prev: BrandActionState,
  formData: FormData,
): Promise<BrandActionState> {
  const actor = await admin();
  if (!actor) return { error: "Not available." };
  const tenantId = id.safeParse(formData.get("tenantId"));
  if (!tenantId.success) return { error: "Not available." };
  const db = getServiceClient();
  const { data: t } = await db.from("tenants").select("name").eq("id", tenantId.data).maybeSingle();
  if (!t) return { error: "That business doesn't exist any more." };
  if (!nameMatches(String(formData.get("confirm") ?? ""), t.name)) {
    return { error: `Type ${t.name} exactly to confirm.` };
  }
  const out = await offboardBrand(deps(), { tenantId: tenantId.data, actorId: actor });
  revalidatePath("/admin/brands");
  return "error" in out ? { error: out.error } : { done: true, issue: out.issue };
}

export async function restoreAction(
  _prev: BrandActionState,
  formData: FormData,
): Promise<BrandActionState> {
  const actor = await admin();
  if (!actor) return { error: "Not available." };
  const tenantId = id.safeParse(formData.get("tenantId"));
  if (!tenantId.success) return { error: "Not available." };
  const out = await restoreBrand(getServiceClient(), { tenantId: tenantId.data, actorId: actor });
  revalidatePath("/admin/brands");
  return "error" in out ? { error: out.error } : { done: true };
}

export async function retryAction(
  _prev: BrandActionState,
  formData: FormData,
): Promise<BrandActionState> {
  const actor = await admin();
  if (!actor) return { error: "Not available." };
  const tenantId = id.safeParse(formData.get("tenantId"));
  if (!tenantId.success) return { error: "Not available." };
  const out = await retryOffboarding(deps(), { tenantId: tenantId.data, actorId: actor });
  revalidatePath("/admin/brands");
  return "error" in out ? { error: out.error } : { done: true, issue: out.issue };
}

export type TestSwitchState = { error?: string };

const testSwitch = z.object({ tenantId: z.uuid(), on: z.enum(["true", "false"]) });

/** The Test switch in a Brands row: marks a business as a test business, or not. */
export async function setTestBusinessAction(
  _prev: TestSwitchState,
  formData: FormData,
): Promise<TestSwitchState> {
  const actor = await admin();
  if (!actor) return { error: "Not available." };
  const input = testSwitch.safeParse({
    tenantId: formData.get("tenantId"),
    on: formData.get("on"),
  });
  if (!input.success) return { error: "Not available." };
  const ok = await setTestBusiness(getServiceClient(), {
    tenantId: input.data.tenantId,
    actorId: actor,
    on: input.data.on === "true",
  });
  if (!ok) return { error: "That business doesn't exist any more." };
  revalidatePath("/admin/brands");
  revalidatePath("/admin/mcp-tools");
  return {};
}
