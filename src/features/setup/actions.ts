"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { updateAutonomyMode } from "@/features/approvals";
import { addStarterAnswers } from "@/features/knowledge-base";
import { getTenantFor, NOT_ALLOWED, updateBusinessProfile } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { markSetupPassed, type SetupPassedHow } from "@/lib/setup/passed";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { getServiceClient } from "@/lib/supabase/service";
import { REPLIES_CHOSEN_ACTION } from "./checklist";
import { nextFromCookie, passHowOf, passTarget, SETUP_NEXT_COOKIE } from "./gate";
import { answerPairs, kindOf, profileText } from "./starter";

export type SetupState = { error?: string };

/**
 * Step 1: the kind of business and a line or two about it (the description Waggle sorts with).
 * Something else carries "what kind, in a few words" (approved 17 Nov).
 */
export async function saveBusinessStep(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const kind = String(formData.get("kind") ?? "");
  if (!kindOf(kind)) return { error: "Pick the kind of business." };
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Write a line or two about what you do." };
  const fd = new FormData();
  const custom = kind === "other" ? String(formData.get("kindOther") ?? "") : "";
  fd.set("profile", profileText(kind, description, BUSINESS_PROFILE_MAX, custom));
  const r = await updateBusinessProfile({}, fd);
  if (r.error) return { error: r.error };
  redirect("/setup?step=2");
}

/**
 * Step 3: answers to the questions the business gets most. The questions are the owner's own
 * (editable, approved 17 Nov), so both come from the form. Blank ones are skipped.
 */
export async function saveAnswersStep(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const pairs = answerPairs(formData.getAll("q"), formData.getAll("a"));
  if (pairs.length) {
    const r = await addStarterAnswers(pairs);
    if ("error" in r) return { error: r.error };
  }
  redirect("/setup?step=4");
}

/** Step 5: how replies to questions go out (Ask me first, or on its own). Leads stay as they are. */
export async function saveRepliesStep(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const mode = formData.get("mode") === "auto" ? "auto" : "approve";
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const fd = new FormData();
  fd.set("category", "faq");
  fd.set("mode", mode);
  const r = await updateAutonomyMode({}, fd);
  if (r.error) return { error: r.error };
  // Done even when the choice is the default (Ask me first): the owner chose it.
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: REPLIES_CHOSEN_ACTION,
    actor: tenant.userId,
    details: { category: "faq", mode },
  });
  // Finishing passes setup (20 Nov): straight to the page they were going to, if any.
  redirect((await passBrand(tenant.id, tenant.userId, "finished")) ?? "/setup?step=6");
}

/**
 * Setup first, then free (approved 20 Nov): marks the brand as through setup, once (audited).
 * Returns the page the owner was going to when the gate sent them here, but only when this call
 * is what passed the brand; that page is then forgotten.
 */
async function passBrand(
  tenantId: string,
  userId: string,
  how: SetupPassedHow,
): Promise<string | null> {
  const passed = await markSetupPassed(getServiceClient(), { tenantId, how, userId });
  const store = await cookies();
  const next = passed ? nextFromCookie(store.get(SETUP_NEXT_COOKIE)?.value, tenantId) : null;
  if (store.has(SETUP_NEXT_COOKIE)) store.delete(SETUP_NEXT_COOKIE);
  return next;
}

/**
 * Skip for now (any step) and Finish later: the first one passes the brand's setup, and if the
 * gate sent the owner here from a page, they go straight back to it. Otherwise on as before.
 */
export async function passSetup(formData: FormData): Promise<void> {
  const how = passHowOf(formData.get("how")) ?? "skipped";
  const to = passTarget(formData.get("to"), how);
  // Only people who may set the brand up pass it (the setup page shows nobody else the buttons).
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) redirect(to);
  redirect((await passBrand(tenant.id, tenant.userId, how)) ?? to);
}
