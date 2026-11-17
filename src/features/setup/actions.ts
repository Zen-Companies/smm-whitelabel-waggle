"use server";

import { redirect } from "next/navigation";
import { updateAutonomyMode } from "@/features/approvals";
import { addStarterAnswers } from "@/features/knowledge-base";
import { getTenantFor, NOT_ALLOWED, updateBusinessProfile } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { getServiceClient } from "@/lib/supabase/service";
import { REPLIES_CHOSEN_ACTION } from "./checklist";
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
  redirect("/setup?step=6");
}
