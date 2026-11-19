"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TZ_COOKIE } from "@/lib/time/zone";

/**
 * Tells the server the browser's time zone (a cookie), so "today" counts start at the viewer's
 * own midnight. Refreshes once when it first learns or changes the zone.
 */
export function TimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TZ_COOKIE}=`))
      ?.slice(TZ_COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
