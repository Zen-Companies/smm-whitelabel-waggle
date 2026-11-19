import "server-only";
import { cookies } from "next/headers";
import { TZ_COOKIE, validTimeZone } from "./zone";

/** The signed-in viewer's time zone from their browser, or "UTC" before it has reported one. */
export async function viewerTimeZone(): Promise<string> {
  return validTimeZone((await cookies()).get(TZ_COOKIE)?.value);
}
