"use client";

import { useEffect } from "react";
import { REF_COOKIE, REF_COOKIE_MAX_AGE_S } from "./referral-code";

/**
 * Sign-up, when it was opened from a friend's link (?ref=): keeps the code in a cookie for 30
 * days, so it still counts with Google sign-up or a confirmation link. The organization made at
 * sign-up is credited to the friend (setupTenantForUser). The invite card (promo-surfaces.tsx,
 * 24 Nov) says so; this only keeps the code.
 */
export function RefCatcher({ code }: { code: string }) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${REF_COOKIE}=${code}; Max-Age=${REF_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
  }, [code]);
  return null;
}
