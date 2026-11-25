import { NextResponse, type NextRequest } from "next/server";
import { acceptInviteAndOpen, INVITE_PATH } from "@/features/orgs";
import { signInNext } from "@/features/auth";
import { recordSignupPlan, setupTenantForUser } from "@/features/tenants";
import { signupStartOf } from "@/lib/checkout-link";
import { createServerSupabase } from "@/lib/supabase/server";
import { siteUrl } from "../site-url";

// Google sign-in comes back here (PKCE code). One login per email: Supabase joins a Google
// sign-in to an existing login with the same verified email. A new login gets its personal
// organization (T54). From an invite link, a matching Google email joins straight away.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = signInNext(params.get("next"));
  const back = (error: string) =>
    NextResponse.redirect(
      siteUrl(request, `/login?error=${error}&next=${encodeURIComponent(next)}`),
    );

  // Google says the person backed out ("access_denied"), or something else went wrong.
  const providerError = params.get("error");
  if (providerError) return back(providerError === "access_denied" ? "google_cancelled" : "google");
  const code = params.get("code");
  if (!code) return back("google");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return back("google");
  const { organizationId } = await setupTenantForUser(data.user);
  // Google sign-up from the site's plan card (25 Nov): next is /welcome?start=solo, which opens
  // Checkout for that plan; the pick is recorded once, here.
  const start = signupStartOf(next);
  if (start) await recordSignupPlan({ organizationId, userId: data.user.id, start, via: "google" });

  const invite = INVITE_PATH.exec(next);
  if (invite && (await acceptInviteAndOpen(invite[1], data.user.id))) {
    return NextResponse.redirect(siteUrl(request, "/today"));
  }
  return NextResponse.redirect(siteUrl(request, next));
}
