"use client";

import { useEffect } from "react";
import { InAppCard } from "@/features/auth";
import { recordConnectBlocked } from "./connect-help-actions";
import type { Device, InApp } from "./connect-help";

// Connect fix 2 (board approved 24 Nov): inside Instagram's or Facebook's own browser (and
// Messenger's or TikTok's, 27 Nov), signing in stops halfway, so the tiles that would fail give
// way to the in-app card (auth's InAppCard, shared with sign-up and sign-in), recorded once as
// `connect_blocked_in_app`.

export function InAppGate({ app, device }: { app: InApp; device: Device }) {
  // `connect_blocked_in_app`, once per browser session per app (the server skips repeats too).
  useEffect(() => {
    const key = `waggle.blocked.${app}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // No session storage here: the server's own check keeps it to one an hour.
    }
    void recordConnectBlocked(app).catch(() => undefined);
  }, [app]);

  return <InAppCard app={app} device={device} where="connect" />;
}
