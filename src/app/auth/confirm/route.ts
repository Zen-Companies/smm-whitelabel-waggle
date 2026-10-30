import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { setupTenantForUser } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";

// Target of the signup confirmation email (emailRedirectTo). Verifies the link, then finishes
// tenant setup in case the signup request didn't.
//
// Redirects go to the address the link was opened on. Behind a tunnel (ngrok) the dev server sees
// itself as https://localhost:3000, so request.url would send the browser to a dead address; the
// forwarded host and protocol name the real one.
function siteUrl(request: NextRequest, path: string): URL {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return new URL(path, host ? `${proto}://${host}` : request.url);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const fail = NextResponse.redirect(siteUrl(request, "/login?error=confirm"));
  if (!tokenHash || !type) return fail;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return fail;

  await setupTenantForUser(data.user);
  return NextResponse.redirect(siteUrl(request, "/settings"));
}
