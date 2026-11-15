"use server";

import { redirect } from "next/navigation";
import { updateAutonomyMode } from "@/features/approvals";
import { addStarterAnswers } from "@/features/knowledge-base";
import { getTenantFor, NOT_ALLOWED, updateBusinessProfile } from "@/features/tenants";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { kindOf, profileText } from "./starter";

export type SetupState = { error?: string };

/** Step 1: the kind of business and a line or two about it (the description Waggle sorts with). */
export async function saveBusinessStep(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const kind = String(formData.get("kind") ?? "");
  if (!kindOf(kind)) return { error: "Pick the kind of business." };
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Write a line or two about what you do." };
  const fd = new FormData();
  fd.set("profile", profileText(kind, description, BUSINESS_PROFILE_MAX));
  const r = await updateBusinessProfile({}, fd);
  if (r.error) return { error: r.error };
  redirect("/setup?step=2");
}

/** Step 3: answers to the three questions the business gets most. Blank ones are skipped. */
export async function saveAnswersStep(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const pairs = [0, 1, 2].flatMap((i) => {
    const question = String(formData.get(`q${i}`) ?? "").trim();
    const answer = String(formData.get(`a${i}`) ?? "").trim();
    return question && answer ? [{ question, answer }] : [];
  });
  if (pairs.length) {
    const r = await addStarterAnswers(pairs);
    if ("error" in r) return { error: r.error };
  }
  redirect("/setup?step=4");
}

/** Step 4: how replies to questions go out (Ask me first, or on its own). Leads stay as they are. */
export async function saveRepliesStep(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const mode = formData.get("mode") === "auto" ? "auto" : "approve";
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const fd = new FormData();
  fd.set("category", "faq");
  fd.set("mode", mode);
  const r = await updateAutonomyMode({}, fd);
  if (r.error) return { error: r.error };
  redirect("/setup?step=5");
}
