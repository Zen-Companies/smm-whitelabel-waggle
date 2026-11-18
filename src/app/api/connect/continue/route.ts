import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CONNECT_COOKIE, safeContinueUrl } from "@/features/accounts";

/**
 * "Continue to Google" on the Before you connect note (approved 18 Nov): sends the browser to the
 * link Zernio gave for this connect, kept in a 10-minute http-only cookie. Used once.
 */
export async function GET(request: Request) {
  const jar = await cookies();
  const raw = jar.get(CONNECT_COOKIE)?.value;
  jar.delete(CONNECT_COOKIE);
  let url: string | null = null;
  try {
    url = safeContinueUrl((JSON.parse(raw ?? "null") as { url?: string } | null)?.url);
  } catch {
    url = null;
  }
  if (!url) {
    return NextResponse.redirect(
      new URL("/settings/accounts?connect_error=expired", request.url),
      303,
    );
  }
  return NextResponse.redirect(url, 303);
}
