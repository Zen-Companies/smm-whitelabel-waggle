"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { traceConnectReturn } from "./connect-trace-actions";

/**
 * Fix 1 (24 Nov): renders nothing. On a page a connect's sign-in came back to, reports the
 * return once (connect_attempts). `always`: the page is only ever reached from a sign-in
 * (/connect/done).
 */
export function ConnectTrace({ always = false }: { always?: boolean }) {
  const params = useSearchParams();
  const sent = useRef<string | null>(null);
  const query = params.toString();
  useEffect(() => {
    if (sent.current === query) return;
    const fromConnect =
      params.has("connecting") ||
      params.has("connected") ||
      (params.has("error") && params.has("platform"));
    if (!always && !fromConnect) return;
    sent.current = query;
    void traceConnectReturn(Object.fromEntries(params.entries()), always).catch(() => undefined);
  }, [always, params, query]);
  return null;
}
