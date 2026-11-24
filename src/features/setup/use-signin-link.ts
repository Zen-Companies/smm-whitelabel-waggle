"use client";

import { useEffect, useState } from "react";
import { makeSigninLink } from "./connect-help-actions";

/**
 * Connect fix 2: the one-time sign-in link to this setup screen, made once the page shows. A new
 * one is made only after it runs out (10 minutes) and while the page is in view: making one
 * replaces the last, so an early refresh would break a link already copied. Null until ready.
 */
export function useSigninLink(): string | null {
  const [link, setLink] = useState<{ url: string; expiresAt: string | null } | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    const next = `${window.location.pathname}${window.location.search}`;
    makeSigninLink(next)
      .then((l) => {
        if (live) setLink(l);
      })
      .catch(() => {
        if (live) setLink({ url: window.location.href, expiresAt: null });
      });
    return () => {
      live = false;
    };
  }, [round]);
  useEffect(() => {
    if (!link?.expiresAt) return;
    const expires = Date.parse(link.expiresAt);
    const renew = () => {
      if (document.visibilityState === "visible" && Date.now() >= expires) setRound((r) => r + 1);
    };
    const t = window.setTimeout(renew, Math.max(expires - Date.now(), 0) + 1_000);
    document.addEventListener("visibilitychange", renew);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", renew);
    };
  }, [link]);
  return link?.url ?? null;
}
