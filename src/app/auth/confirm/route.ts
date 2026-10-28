import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { setupTenantForUser } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";

// Target of the signup confirmation email (emailRedirectTo). Verifies the link, then finishes
// tenant setup in case the signup request didn't.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const fail = NextResponse.redirect(new URL("/login?error=confirm", request.url));
  if (!tokenHash || !type) return fail;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return fail;

  await setupTenantForUser(data.user);
  return NextResponse.redirect(new URL("/settings", request.url));
}
