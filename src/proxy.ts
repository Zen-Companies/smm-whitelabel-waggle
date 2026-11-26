import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { legacyPath, PATH_HEADER } from "@/lib/routes";
import { loginForStart } from "@/lib/checkout-link";
import { signedOutHome } from "@/lib/seo";
import { UTM_COOKIE, UTM_COOKIE_MAX_AGE, utmFromParams } from "@/lib/crm/utm";

// Refreshes the Supabase session cookie on page requests. Authorization happens close to the
// data (getCurrentUser, Server Actions), not here. Old addresses (emails, bookmarks) forward to
// where the page lives now (src/lib/routes.ts).
export async function proxy(request: NextRequest) {
  const moved = legacyPath(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (moved) return NextResponse.redirect(new URL(moved, request.url), 308);

  // The page asked for, for server layouts (the setup gate, 20 Nov). Always ours: set here,
  // replacing anything the browser sent.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Signed-out visitors to the app's home go to gowaggle.ai on production with a real 308 (the
  // page's own redirect streams, so search engines saw the old landing page; hotfix 26 Nov).
  const publicHome =
    request.nextUrl.pathname === "/" &&
    signedOutHome(process.env.VERCEL_ENV).startsWith("https://");
  if (!url || !anonKey) {
    return publicHome
      ? NextResponse.redirect(signedOutHome(process.env.VERCEL_ENV), 308)
      : response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = forward();
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && publicHome) {
    return NextResponse.redirect(signedOutHome(process.env.VERCEL_ENV), 308);
  }
  // HighLevel's checkout link (25 Nov) signed out: sign in, then back to the same link.
  if (!data.user) {
    const login = loginForStart(request.nextUrl.pathname, request.nextUrl.searchParams);
    if (login) return NextResponse.redirect(new URL(login, request.url));
  }
  // First-touch campaign (CRM, 18 Nov): the first link with UTMs wins, for 90 days.
  const utm = utmFromParams(request.nextUrl.searchParams);
  if (utm && !request.cookies.get(UTM_COOKIE)) {
    response.cookies.set(UTM_COOKIE, JSON.stringify(utm), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: UTM_COOKIE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}

export const config = {
  // Not webhooks or jobs (no user session), not static assets.
  // Not /api/mcp or its metadata either: AI assistants send a bearer token, not cookies.
  matcher: [
    "/((?!api/webhooks|api/jobs|api/mcp|\\.well-known|_next/static|_next/image|favicon.ico).*)",
  ],
};
