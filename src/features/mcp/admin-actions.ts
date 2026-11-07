"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentStaffAccess } from "@/features/staff";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { emailsOf } from "@/lib/supabase/users";
import {
  runPlayground,
  setBrandDailyCap,
  setBrandSwitch,
  setGlobalSwitch,
  type PlaygroundResult,
} from "./admin";
import { parseDailyCap } from "./admin-filters";

// Staff MCP page actions (docs/mcp/PLAN.md §7, Phase 4). Each checks its permission here too: a
// Server Action is reachable without the page.

export type SwitchFormState = { saved?: boolean; error?: string };
export type PlaygroundState = { result?: PlaygroundResult; error?: string };

async function staffWith(permission: "flags.manage" | "mcp.playground.run") {
  const access = await currentStaffAccess();
  return access.permissions.has(permission) ? access.userId : null;
}

export async function switchEveryone(
  _prev: SwitchFormState,
  formData: FormData,
): Promise<SwitchFormState> {
  const actor = await staffWith("flags.manage");
  if (!actor) return { error: "Not available." };
  await setGlobalSwitch(getServiceClient(), actor, formData.get("on") === "true");
  revalidatePath("/admin/switches");
  return { saved: true };
}

export async function switchBrand(
  _prev: SwitchFormState,
  formData: FormData,
): Promise<SwitchFormState> {
  const actor = await staffWith("flags.manage");
  if (!actor) return { error: "Not available." };
  const tenantId = z.uuid().safeParse(formData.get("tenantId"));
  if (!tenantId.success) return { error: "That brand wasn't found." };
  const done = await setBrandSwitch(
    getServiceClient(),
    actor,
    tenantId.data,
    formData.get("on") === "true",
  );
  if (!done) return { error: "That brand wasn't found." };
  revalidatePath("/admin/switches");
  return { saved: true };
}

export async function saveDailyCap(
  _prev: SwitchFormState,
  formData: FormData,
): Promise<SwitchFormState> {
  const actor = await staffWith("flags.manage");
  if (!actor) return { error: "Not available." };
  const tenantId = z.uuid().safeParse(formData.get("tenantId"));
  if (!tenantId.success) return { error: "That brand wasn't found." };
  const parsed = parseDailyCap(formData.get("cap"));
  if ("error" in parsed) return { error: parsed.error };
  const done = await setBrandDailyCap(getServiceClient(), actor, tenantId.data, parsed.cap);
  if (!done) return { error: "That brand wasn't found." };
  revalidatePath("/admin/switches");
  return { saved: true };
}

const runInput = z.object({
  tool: z.string().min(1).max(64),
  userId: z.uuid(),
  tenantId: z.uuid(),
  input: z.string().max(20_000),
});

export async function runTryIt(
  _prev: PlaygroundState,
  formData: FormData,
): Promise<PlaygroundState> {
  const staffId = await staffWith("mcp.playground.run");
  if (!staffId) return { error: "Not available." };
  const parsed = runInput.safeParse({
    tool: formData.get("tool"),
    userId: formData.get("userId"),
    tenantId: formData.get("tenantId"),
    input: formData.get("input") ?? "",
  });
  if (!parsed.success) return { error: "Pick who to run as and a test brand." };
  const db = getServiceClient();
  const staffEmail = (await emailsOf(db, [staffId])).get(staffId) ?? "staff";
  const out = await runPlayground(
    { db, social: getSocialProvider },
    { staffId, staffEmail, ...parsed.data },
  );
  if ("refused" in out) return { error: out.refused };
  return { result: out };
}
