import "server-only";
import type { User } from "@supabase/supabase-js";
import { ensurePersonalOrg } from "@/features/orgs";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * Sign-up, login and email confirmation (T54): makes sure the login has its personal
 * organization ("Febron's Organization"). No brand is created here any more; the first brand is
 * added on /welcome, and its Zernio profile is made then. Only call it with a user verified by
 * Supabase Auth (signUp/signIn/verifyOtp result), never with client input.
 */
export async function setupTenantForUser(user: User): Promise<{ organizationId: string }> {
  return { organizationId: await ensurePersonalOrg(getServiceClient(), user.id) };
}
