import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { backfillComments, checkAccountsHealth, requestBackfillForAll } from "@/features/accounts";
import {
  deliverPendingAlerts,
  enqueueDraftNudges,
  getMailer,
  handlePlatformPause,
} from "@/features/alerts";
import { escalateClosingDmWindows } from "@/features/approvals";
import { getProductionSteps, processDueItems } from "@/features/inbox";
import { publishQueuedPosts, settleMockPosts } from "@/features/publishing";
import { embedPendingEntries } from "@/features/knowledge-base";
import { createDeadline } from "@/lib/jobs";
import { getLlmClientOrNull } from "@/lib/llm";
import { getSocialProvider, resolveSocialProviderMode } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";

// Called every minute by pg_cron + pg_net with `Authorization: Bearer CRON_SECRET` (§7.2).
// 60 s max so runs don't overlap; the deadline stops claiming at 45 s.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const db = getServiceClient();
    const deadline = createDeadline();
    // T19: if Zernio is paused, alert the operator once and probe; resumes before sending.
    const platform = await handlePlatformPause({
      db,
      social: getSocialProvider,
      mailer: getMailer(),
      operatorEmail: process.env.OPERATOR_ALERT_EMAIL,
      appUrl: process.env.APP_URL ?? "",
      onResume: (pausedAt) => requestBackfillForAll(db, pausedAt),
    });
    const items = await processDueItems({ db, steps: getProductionSteps(), deadline });

    // Knowledge base entries without an embedding (new, edited, or a failed embed: T8).
    const llm = getLlmClientOrNull();
    const kb =
      llm && deadline.canStartItem()
        ? await embedPendingEntries({ db, llm }, { shouldContinue: deadline.canStartItem })
        : { embedded: 0, failed: 0 };

    // T14: posts still queued (after a pause, a rate limit or an unclear error). In mock mode no
    // post webhooks arrive, so due mock posts are settled as published here.
    const posts = await publishQueuedPosts({
      db,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });
    if (resolveSocialProviderMode(process.env) === "mock") await settleMockPosts(db);

    // T16: hourly account health check (catches a missed disconnect webhook) and the comment
    // backfill after a connect, a recovery or a Zernio pause.
    const health = await checkAccountsHealth({
      db,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });
    const backfill = await backfillComments({
      db,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });

    // T13: DMs about to lose their reply window, drafts waiting > 30 min, then the alert outbox
    // (escalations, leads, disconnects, nudges). Each sweep is cheap; delivery stops when time's up.
    const dmWindowsEscalated = await escalateClosingDmWindows(db);
    const nudges = await enqueueDraftNudges(db);
    const alerts = await deliverPendingAlerts({
      db,
      mailer: getMailer(),
      appUrl: process.env.APP_URL ?? "",
      shouldContinue: () => deadline.remainingMs() > 10_000,
    });

    return Response.json({
      ...items,
      kbEmbedded: kb.embedded,
      kbEmbedFailed: kb.failed,
      dmWindowsEscalated,
      nudges,
      alerts,
      platform,
      posts,
      health,
      backfill,
    });
  } catch (error) {
    // Visible in the Vercel logs even without Sentry. Our own error text only, never customer
    // message text (CLAUDE.md rule 10).
    console.error(
      "jobs/process failed:",
      error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 500) : "unknown error",
    );
    Sentry.captureException(error);
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
