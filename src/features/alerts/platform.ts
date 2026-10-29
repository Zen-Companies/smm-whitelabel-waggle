import * as Sentry from "@sentry/nextjs";
import {
  clearPlatformPause,
  getPlatformPause,
  PLATFORM_PAUSE_PROBE_MS,
  updatePlatformPause,
} from "@/lib/social/platform-pause";
import type { SocialProvider } from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
import { logMailer, type Mailer } from "./mailer";

// T19, job route side: while Zernio is paused, tell the operator once (never the owners), and
// probe Zernio at most every 5 minutes; the first successful call ends the pause and sending
// resumes on its own.

export interface PlatformPauseResult {
  paused: boolean;
  operatorAlerted?: boolean;
  resumed?: boolean;
}

export async function handlePlatformPause(deps: {
  db: ServiceClient;
  social: () => SocialProvider;
  mailer: Mailer;
  operatorEmail: string | undefined;
  appUrl: string;
  now?: Date;
  /** Called once the pause ends, with when it began (the job route requests a backfill). */
  onResume?: (pausedAt: Date) => Promise<void>;
}): Promise<PlatformPauseResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const pause = await getPlatformPause(db);
  if (!pause) return { paused: false };
  const result: PlatformPauseResult = { paused: true };

  if (!pause.operatorAlertedAt) {
    Sentry.captureMessage("Zernio returned 402 PAYMENT_REQUIRED: sending paused", {
      level: "error",
      extra: { pausedAt: pause.pausedAt },
    });
    const text = [
      "Zernio has paused the account (402 PAYMENT_REQUIRED), so no replies or posts can be sent for any business.",
      "Nothing has been escalated to business owners. Sending resumes on its own once Zernio accepts calls again.",
      "Fix: update the payment method in the Zernio dashboard (Billing).",
      `Paused since ${pause.pausedAt}.`,
    ].join("\n");
    // No operator address configured: log it (the Sentry event above still fires).
    const mailer = deps.operatorEmail ? deps.mailer : logMailer;
    try {
      await mailer.send({
        to: deps.operatorEmail ? [deps.operatorEmail] : [],
        subject: "Operator: Zernio paused, sending is on hold",
        text,
        html: text
          .split("\n")
          .map((l) => `<p>${l}</p>`)
          .join(""),
        // One email per pause, even if this sweep runs again before the row is updated.
        idempotencyKey: `zernio-paused-${pause.pausedAt}`,
      });
      await updatePlatformPause(db, { operatorAlertedAt: now.toISOString() });
      result.operatorAlerted = true;
    } catch (error) {
      // Tried again on the next tick; never blocks the rest of the job route.
      Sentry.captureException(error);
    }
  }

  const lastProbe = pause.lastProbeAt ? Date.parse(pause.lastProbeAt) : 0;
  if (now.getTime() - lastProbe >= PLATFORM_PAUSE_PROBE_MS) {
    try {
      await deps.social().ping();
      await clearPlatformPause(db);
      // T16: comments that arrived while Zernio wasn't polling inboxes.
      await deps.onResume?.(new Date(pause.pausedAt));
      return { ...result, paused: false, resumed: true };
    } catch (error) {
      await updatePlatformPause(db, { lastProbeAt: now.toISOString() });
      if (!isPlatformPaused(error)) Sentry.captureException(error);
    }
  }
  return result;
}
