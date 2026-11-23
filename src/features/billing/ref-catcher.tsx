"use client";

import { useEffect } from "react";
import { REF_COOKIE, REF_COOKIE_MAX_AGE_S } from "./referral-code";

/**
 * Sign-up, when it was opened from a friend's link (?ref=): keeps the code in a cookie for 30
 * days, so it still counts with Google sign-up or a confirmation link. The organization made at
 * sign-up is credited to the friend (setupTenantForUser). Says so in one line, nothing to do.
 */
export function RefCatcher({ code }: { code: string }) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${REF_COOKIE}=${code}; Max-Age=${REF_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
  }, [code]);
  return (
    <p className="border-honey bg-honey-tint mb-4 rounded-xl border px-4 py-3 text-sm font-semibold">
      A friend sent you here: your first month on a paid plan is free.
    </p>
  );
}
