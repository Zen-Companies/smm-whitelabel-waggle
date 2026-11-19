import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordSignin } from "@/features/platforms";
import type { getServiceClient } from "@/lib/supabase/service";
import { needsConnectNote, opensWelcome } from "./connect-note";
import { DEFAULT_RETURN, safeReturnPath, withParams } from "./connect-return";

export const CONNECT_COOKIE = "waggle_connect_next";

/**
 * After Waggle has Zernio's link: straight there when it opens our welcome page, otherwise the
 * "Before you connect" note first (design "Every Zernio platform", approved 18 Nov). The link is
 * kept in a short-lived, http-only cookie, never in the address bar. The note lives on Settings →
 * Connected accounts; `back` (the page the connect started from) is where Not now returns.
 */
export async function goToConnect(input: {
  db: ReturnType<typeof getServiceClient>;
  id: string;
  authUrl: string;
  back?: string;
}): Promise<never> {
  const back = safeReturnPath(input.back);
  const appUrl = process.env.APP_URL;
  const welcome = opensWelcome(input.authUrl, appUrl);
  let mock = false;
  try {
    const host = new URL(input.authUrl).host;
    mock = host === (appUrl ? new URL(appUrl).host : "") || host.startsWith("localhost");
  } catch {
    // not a URL: the note's Continue refuses it
  }
  if (!mock) {
    await recordSignin(input.db, input.id, welcome ? "welcome" : "platform").catch(() => undefined);
  }
  if (!needsConnectNote(input.id, input.authUrl, appUrl)) redirect(input.authUrl);
  const jar = await cookies();
  jar.set(CONNECT_COOKIE, JSON.stringify({ id: input.id, url: input.authUrl, back }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/",
  });
  const note = withParams(DEFAULT_RETURN, {
    before: input.id,
    back: back && back !== DEFAULT_RETURN ? back : null,
  });
  redirect(`${note}#before-${encodeURIComponent(input.id)}`);
}
