import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";

// First connect (20 Nov): start a new account's catch-up right away instead of at the next
// once-a-minute job run. The connect handler (often inside the Zernio webhook route, which must
// stay fast and AI-free: CLAUDE.md rule 3) only schedules, after its response, one POST to
// /api/jobs/catch-up; that route answers 202 and does the work in its own invocation. While the
// catch-up isn't ready, the route kicks itself again, up to MAX_KICK_HOPS times; the cron job
// carries on from there.

export const MAX_KICK_HOPS = 10;
/** The POST itself only has to be accepted (the route answers 202 at once). */
const KICK_TIMEOUT_MS = 10_000;

/** The kick's request, or null when the app URL or the job secret isn't set (pure). */
export function catchUpKickRequest(
  env: { APP_URL?: string; CRON_SECRET?: string },
  tenantId: string,
  hop: number,
): { url: string; init: RequestInit } | null {
  if (!env.APP_URL || !env.CRON_SECRET || hop > MAX_KICK_HOPS) return null;
  return {
    url: `${env.APP_URL.replace(/\/+$/, "")}/api/jobs/catch-up`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
      body: JSON.stringify({ tenantId, hop }),
    },
  };
}

/** Schedules the kick after the current response. Outside a request (scripts, tests): nothing. */
export function kickCatchUp(tenantId: string, hop = 0): void {
  const { APP_URL, CRON_SECRET } = process.env;
  const request = catchUpKickRequest({ APP_URL, CRON_SECRET }, tenantId, hop);
  if (!request) return;
  try {
    after(async () => {
      try {
        const res = await fetch(request.url, {
          ...request.init,
          signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
        });
        await res.body?.cancel();
      } catch (error) {
        // The cron run picks it up within a minute.
        Sentry.captureException(error, { extra: { tenantId, hop } });
      }
    });
  } catch {
    // Not inside a request: the cron run picks it up.
  }
}
