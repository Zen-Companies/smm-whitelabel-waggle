import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { claimReferral, REF_COOKIE } from "@/features/billing";
import { ensurePersonalOrg } from "@/features/orgs";
import { START_PLAN_ID, type StartPlan } from "@/lib/checkout-link";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * Sign-up, login and email confirmation (T54): makes sure the login has its personal
 * organization ("Febron's Organization"). No brand is created here any more; the first brand is
 * added on /welcome, and its Zernio profile is made then. Only call it with a user verified by
 * Supabase Auth (signUp/signIn/verifyOtp result), never with client input.
 *
 * Give a month, get a month (23 Nov): if sign-up was opened from a friend's link, the code waits
 * in a cookie (RefCatcher); a brand-new organization is credited to that friend, then the cookie
 * goes. Works the same for email, Google and confirmation links. Never blocks the sign-in.
 */
export async function setupTenantForUser(user: User): Promise<{ organizationId: string }> {
  const db = getServiceClient();
  const organizationId = await ensurePersonalOrg(db, user.id);
  try {
    const store = await cookies();
    const code = store.get(REF_COOKIE)?.value;
    if (code) {
      await claimReferral(db, organizationId, code);
      store.delete(REF_COOKIE);
    }
  } catch {
    // Read-only cookies (a page render) or no request: the referral waits for the next sign-in.
  }
  return { organizationId };
}

/**
 * Sign-up carried a plan picked on the site (25 Nov): one organization history row (rule 11),
 * with the plan's id (Team is `business`) and how they signed up. Never blocks the sign-up.
 */
export async function recordSignupPlan(input: {
  organizationId: string;
  userId: string;
  start: StartPlan;
  via: "email" | "google";
}): Promise<void> {
  const { error } = await getServiceClient()
    .from("organization_audit")
    .insert({
      organization_id: input.organizationId,
      action: "signup_plan_picked",
      actor: input.userId,
      details: { plan: START_PLAN_ID[input.start], via: input.via },
    });
  if (error)
    Sentry.captureException(new Error(`signup_plan_picked audit failed: ${error.message}`));
}
