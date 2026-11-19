"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { setupGate } from "./gate";

/**
 * The gate for moves inside the app (the dashboard layout doesn't re-render on those): rendered
 * only for an owner still gated, who can be on an open page such as Your plan. Shows nothing.
 */
export function SetupGateWatch() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const path = search ? `${pathname}?${search}` : pathname;
    const decision = setupGate({ passed: false, role: "owner", staff: false, path });
    if (decision !== "open") window.location.replace(decision.redirect);
  }, [pathname, search]);
  return null;
}
