import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  CONNECT_COOKIE,
  connectErrorHref,
  connectOrigin,
  safeContinueUrl,
} from "@/features/accounts";

/**
 * "Continue to Google" on the Before you connect note (approved 18 Nov): sends the browser to the
 * link Zernio gave for this connect, kept in a 10-minute http-only cookie. Used once. When it's
 * gone, back to the page the connect started from, which says the link expired (20 Nov).
 */
export async function GET(request: Request) {
  const jar = await cookies();
  const raw = jar.get(CONNECT_COOKIE)?.value;
  jar.delete(CONNECT_COOKIE);
  let url: string | null = null;
  let back: unknown = null;
  try {
    const saved = JSON.parse(raw ?? "null") as { url?: string; back?: unknown } | null;
    url = safeContinueUrl(saved?.url);
    back = saved?.back;
  } catch {
    url = null;
  }
  if (!url) {
    return NextResponse.redirect(
      new URL(connectErrorHref(connectOrigin(back), "expired"), request.url),
      303,
    );
  }
  return NextResponse.redirect(url, 303);
}
