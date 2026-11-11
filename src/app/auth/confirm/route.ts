import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { setupTenantForUser } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { siteUrl } from "../site-url";

// Target of Waggle's sign-in emails (supabase/templates): sign-up confirmation, password reset
// and email change. Each link carries a token hash, so it works in any browser. Verifying it
// signs the person in; then they land where that email leads.
const NEXT: Partial<Record<EmailOtpType, string>> = {
  signup: "/welcome",
  email: "/welcome",
  recovery: "/reset",
  email_change: "/settings?section=account&email=changed",
};
const FAIL: Partial<Record<EmailOtpType, string>> = {
  recovery: "/forgot?expired=1",
  email_change: "/settings?section=account&email=expired",
};

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const fail = (t: EmailOtpType | null) =>
    NextResponse.redirect(siteUrl(request, (t && FAIL[t]) ?? "/login?error=confirm"));
  if (!tokenHash || !type) return fail(type);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return fail(type);

  // Makes the personal organization in case the sign-up request didn't (T54).
  await setupTenantForUser(data.user);
  return NextResponse.redirect(siteUrl(request, NEXT[type] ?? "/welcome"));
}
