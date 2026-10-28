import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { setupOwnerTenant } from "./setup";

function businessNameOf(user: User): string {
  const name = user.user_metadata?.business_name;
  return typeof name === "string" && name.trim() ? name : "My business";
}

/**
 * Creates or completes the user's tenant and Zernio profile. Only call it with a user verified
 * by Supabase Auth (signUp/signIn/verifyOtp result), never with client input.
 */
export async function setupTenantForUser(user: User) {
  return setupOwnerTenant(
    { db: getServiceClient(), social: getSocialProvider },
    { userId: user.id, businessName: businessNameOf(user) },
  );
}
