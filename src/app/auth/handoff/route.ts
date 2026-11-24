import { NextResponse, type NextRequest } from "next/server";
import { handoffParams, redeemSigninLink } from "@/features/auth/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "../site-url";

// Target of the one-time sign-in link (Connect fix 2): opened in Safari or Chrome after leaving
// Instagram's or Facebook's browser, or on a phone from the desktop QR code. Signs the person in
// once and lands them on the same setup screen; an old or used link goes to sign-in.
export async function GET(request: NextRequest) {
  const fail = () => NextResponse.redirect(siteUrl(request, "/login?error=link"));
  const parsed = handoffParams.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return fail();

  const supabase = await createServerSupabase();
  const next = await redeemSigninLink(
    getServiceClient(),
    { id: parsed.data.id, tokenHash: parsed.data.token_hash },
    async (tokenHash) => {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      return { userId: error ? null : (data.user?.id ?? null) };
    },
    async () => {
      await supabase.auth.signOut();
    },
  );
  if (!next) return fail();
  const response = NextResponse.redirect(siteUrl(request, next));
  // The link is in this address: never let a cache keep it.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
