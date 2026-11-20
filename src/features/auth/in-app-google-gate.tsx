"use client";

import { useEffect, useState } from "react";
import { inAppName, isInAppBrowser } from "./in-app-browser";

/**
 * Shows the Google button (children) in a normal browser. Inside TikTok, Instagram, Facebook and
 * other apps' embedded browsers, where Google blocks sign-in, it shows a short note instead so
 * people go straight to the email form below (design.md §4: feedback in place, no toasts).
 * The user agent is only readable in the browser, so the button shows until the check runs.
 */
export function InAppGoogleGate({ children }: { children: React.ReactNode }) {
  const [app, setApp] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the user agent is client-only
    if (isInAppBrowser(ua)) setApp(inAppName(ua));
  }, []);

  if (!app) return <>{children}</>;
  return (
    <p role="note" className="banner text-sm">
      You&apos;re in {app}&apos;s browser, where Google sign-in doesn&apos;t work. Use your email
      below. Or tap <b>•••</b> and choose <b>Open in browser</b> to use Google.
    </p>
  );
}
