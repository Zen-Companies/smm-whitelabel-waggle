import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";

// Check now (board "Your week", 26 Nov): the run starts right away instead of at the next
// once-a-minute job run. The action only schedules, after its response, one POST to
// /api/jobs/weekly, which answers 202 and reads in its own invocation; while the run isn't done it
// kicks itself again, up to MAX_WEEKLY_HOPS times, and the cron job carries on from there.

export const MAX_WEEKLY_HOPS = 5;
const KICK_TIMEOUT_MS = 10_000;

/** The kick's request, or null when the app URL or the job secret isn't set (pure). */
export function weeklyKickRequest(
  env: { APP_URL?: string; CRON_SECRET?: string; VERCEL_AUTOMATION_BYPASS_SECRET?: string },
  tenantId: string,
  hop: number,
): { url: string; init: RequestInit } | null {
  if (!env.APP_URL || !env.CRON_SECRET || hop > MAX_WEEKLY_HOPS) return null;
  return {
    url: `${env.APP_URL.replace(/\/+$/, "")}/api/jobs/weekly`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CRON_SECRET}`,
        ...(env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
      body: JSON.stringify({ tenantId, hop }),
    },
  };
}

/** Schedules the kick after the current response. Outside a request: nothing (cron picks it up). */
export function kickWeeklyCheck(tenantId: string, hop = 0): void {
  const { APP_URL, CRON_SECRET, VERCEL_AUTOMATION_BYPASS_SECRET } = process.env;
  const request = weeklyKickRequest(
    { APP_URL, CRON_SECRET, VERCEL_AUTOMATION_BYPASS_SECRET },
    tenantId,
    hop,
  );
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
        Sentry.captureException(error, { extra: { tenantId, hop } });
      }
    });
  } catch {
    // Not inside a request: the cron run picks it up.
  }
}
