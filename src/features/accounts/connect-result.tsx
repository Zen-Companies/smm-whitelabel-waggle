"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { connectBanner } from "./connect-banner";
import { DEFAULT_RETURN } from "./connect-return";

/**
 * What happened to a connect started on this page, said in place at the top of the page
 * (20 Nov): an error, or that the account is on its way. Settings → Connected accounts and setup
 * say it themselves, next to their own Connect buttons.
 */
export function ConnectResult() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname === DEFAULT_RETURN || pathname.startsWith("/setup")) return null;
  // Only a connect's own params: `error` alone may mean something else on a page.
  const ours =
    params.has("connect_error") ||
    params.has("connecting") ||
    params.has("connected") ||
    (params.has("error") && params.has("platform"));
  if (!ours) return null;
  const banner = connectBanner(Object.fromEntries(params.entries()));
  if (!banner) return null;
  return (
    <p
      role={banner.tone === "error" ? "alert" : "status"}
      className={banner.tone === "error" ? "danger-box" : "banner"}
    >
      {banner.text}
    </p>
  );
}
