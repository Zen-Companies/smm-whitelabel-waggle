import * as Sentry from "@sentry/nextjs";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { busyLines, localParts, todayLine } from "./busy";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The brand's calendar: its first active Gmail or Outlook account (connected with calendar). */
export async function calendarAccount(
  db: ServiceClient,
  tenantId: string,
): Promise<{ zernioAccountId: string; platform: "google" | "microsoft" } | null> {
  const { data } = await db
    .from("social_accounts")
    .select("zernio_account_id, platform")
    .eq("tenant_id", tenantId)
    .in("platform", ["google", "microsoft"])
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data
    ? { zernioAccountId: data.zernio_account_id, platform: data.platform as "google" | "microsoft" }
    : null;
}

/**
 * The owner's busy times for the next 7 days, for a booking draft (T81d). Null when no calendar
 * is connected or it can't be read: the draft then goes without (it never invents a time).
 */
export async function loadBusyTimes(
  deps: { db: ServiceClient; social: SocialProvider },
  tenantId: string,
  now: Date,
  signal?: AbortSignal,
): Promise<{ today: string; busy: string[] } | null> {
  const account = await calendarAccount(deps.db, tenantId);
  if (!account) return null;
  try {
    const events = await deps.social.listCalendarEvents({
      accountId: account.zernioAccountId,
      from: now.toISOString(),
      to: new Date(now.getTime() + WEEK_MS).toISOString(),
      signal,
    });
    const offset = events[0] && !events[0].allDay ? localParts(events[0].start).offset : null;
    return { today: todayLine(now, offset), busy: busyLines(events) };
  } catch (error) {
    // Ids only (rule 10).
    Sentry.captureException(error, { extra: { tenantId, step: "loadBusyTimes" } });
    return null;
  }
}
