import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { backfillComments, checkAccountsHealth, requestBackfillForAll } from "@/features/accounts";
import {
  deliverDueDigests,
  deliverPendingAlerts,
  enqueueDraftNudges,
  getMailer,
  handlePlatformPause,
  sendMorningAfterEmails,
} from "@/features/alerts";
import { syncAnalytics } from "@/features/analytics";
import { finishCatchUps, runCatchUps } from "@/features/catch-up";
import { crmClient, deliverCrmEvents, sweepInactive, sweepUsage } from "@/features/crm";
import { chargeUsageAtCost, getStripe } from "@/features/billing";
import { sendQuietLeadFollowUps } from "@/features/automations";
import { pruneCalls } from "@/features/mcp";
import { purgeDueBrands } from "@/features/offboarding";
import { sweepIdleOrgs } from "@/features/idle";
import { escalateClosingDmWindows } from "@/features/approvals";
import { getProductionSteps, pollFacebookReviews, processDueItems } from "@/features/inbox";
import { publishQueuedPosts, settleMockPosts } from "@/features/publishing";
import { embedPendingEntries, findFactsAfterConnect } from "@/features/knowledge-base";
import { getClassifier } from "@/lib/classifier";
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
    // First connect (19 Nov): the 30-day catch-up of comments and DMs, a slice per run.
    const catchUp = await runCatchUps({
      db,
      social: getSocialProvider,
      classifier: getClassifier(),
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });
    // Walter's flow (decision 7): once a catch-up has read the account, the business info found
    // on it (profile, captions) is saved not checked. One AI call per first connect at most.
    const foundFacts = await findFactsAfterConnect({
      db,
      llm,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 20_000,
    }).catch((e: unknown) => {
      Sentry.captureException(e);
      return { error: true };
    });
    // First connect (20 Nov): catch-ups read and sorted get the reveal's drafts picked and their
    // top questions (one AI call each, cached).
    const catchUpFinish = await finishCatchUps({
      db,
      llm,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    }).catch((e: unknown) => {
      Sentry.captureException(e);
      return { error: true };
    });

    // T13: DMs about to lose their reply window, drafts waiting > 30 min, then the alert outbox
    // (escalations, leads, disconnects, nudges). Each sweep is cheap; delivery stops when time's up.
    // T42: Facebook Page reviews (no webhook), every few minutes per Page.
    const reviews = await pollFacebookReviews({
      db,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });

    // T48: analytics copies for a few due brands (hourly / weekly / daily parts). Each call is
    // started only with time left, so a slow Zernio never pushes the run past its limit.
    const analytics = await syncAnalytics({
      db,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 25_000,
    });

    // Usage at cost (18 Nov): pay-per-use added to renewal invoices before Stripe charges them.
    const usageAtCost = await chargeUsageAtCost({
      db,
      stripe: getStripe(),
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });

    // Follow-ups for leads that went quiet (18 Nov): the owner's message, through Zernio Sequences.
    const followUps = await sendQuietLeadFollowUps({
      db,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });

    // T21: brands offboarded 3 months ago are deleted for good (Zernio clean-up first).
    const offboarding = await purgeDueBrands({
      db,
      social: getSocialProvider,
      shouldContinue: () => deadline.remainingMs() > 15_000,
    });

    // Free plan (19 Nov): organizations nobody used for 23 days get one warning, 30 days a
    // disconnect. Each organization at most once a day; off until staff switch it on.
    const idle = await sweepIdleOrgs({
      db,
      social: getSocialProvider,
      mailer: getMailer(),
      appUrl: process.env.APP_URL ?? "",
      shouldContinue: () => deadline.remainingMs() > 15_000,
    }).catch((e: unknown) => {
      Sentry.captureException(e);
      return { error: true };
    });

    // MCP: the AI-assistant activity log keeps 90 days.
    const mcpCallsPruned = await pruneCalls(db, new Date());
    const dmWindowsEscalated = await escalateClosingDmWindows(db);
    const nudges = await enqueueDraftNudges(db);
    const alerts = await deliverPendingAlerts({
      db,
      mailer: getMailer(),
      appUrl: process.env.APP_URL ?? "",
      shouldContinue: () => deadline.remainingMs() > 10_000,
    });
    // CRM (features/crm): every 15 minutes queue inactive / usage events, then send the queue.
    const crmSweep =
      new Date().getUTCMinutes() % 15 === 0
        ? {
            inactive: await sweepInactive(db).catch((e: unknown) => {
              Sentry.captureException(e);
              return 0;
            }),
            usage: await sweepUsage(db).catch((e: unknown) => {
              Sentry.captureException(e);
              return 0;
            }),
          }
        : null;
    const crm = await deliverCrmEvents({
      db,
      client: crmClient(),
      shouldContinue: () => deadline.remainingMs() > 8_000,
    }).catch((e: unknown) => {
      Sentry.captureException(e);
      return { error: true };
    });
    // 18 Nov: the hourly / 2-hourly summaries that are due.
    const digests = await deliverDueDigests({
      db,
      mailer: getMailer(),
      appUrl: process.env.APP_URL ?? "",
      shouldContinue: () => deadline.remainingMs() > 8_000,
    });

    // First connect (20 Nov): the one "Waggle caught N new messages overnight" email, the
    // morning after an organization's first connect.
    const morningAfter = await sendMorningAfterEmails({
      db,
      mailer: getMailer(),
      appUrl: process.env.APP_URL ?? "",
      shouldContinue: () => deadline.remainingMs() > 8_000,
    }).catch((e: unknown) => {
      Sentry.captureException(e);
      return { error: true };
    });

    return Response.json({
      crm,
      morningAfter,
      crmSweep,
      digests,
      ...items,
      kbEmbedded: kb.embedded,
      followUpsSent: followUps.sent,
      followUpsFailed: followUps.failed,
      usageAtCostAdded: usageAtCost.added,
      usageAtCostMissed: usageAtCost.missed,
      kbEmbedFailed: kb.failed,
      dmWindowsEscalated,
      nudges,
      alerts,
      platform,
      posts,
      health,
      backfill,
      catchUp,
      catchUpFinish,
      foundFacts,
      reviews,
      analytics,
      mcpCallsPruned,
      offboarding,
      idle,
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
