import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { CONNECT_ABANDON_AFTER_MS } from "./connect-trace";
import { unfinishedConnect, unfinishedTimers, type UnfinishedConnect } from "./connect-unfinished";

/**
 * "Didn't finish?" (26 Nov): the brand's latest connect try still open (no outcome, platform not
 * connected, under 2 hours old), read with the signed-in user's client (members read their own
 * brand's rows). The 1-minute wait runs in the browser (`showInMs`), so a page opened 20 seconds
 * after the try still shows the note at the minute. Never stops the page: on an error, no note.
 */
export async function loadUnfinishedConnect(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  connectedPlatforms: readonly string[],
  now: Date = new Date(),
): Promise<UnfinishedConnect | null> {
  const since = new Date(now.getTime() - CONNECT_ABANDON_AFTER_MS).toISOString();
  const { data, error } = await supabase
    .from("connect_attempts")
    .select("id, platform, started_at, outcome")
    .eq("tenant_id", tenantId)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) {
    Sentry.captureException(new Error(`connect_attempts read failed: ${error.message}`), {
      extra: { tenantId },
    });
    return null;
  }
  const tries = (data ?? []).map((r) => ({
    id: r.id,
    platform: r.platform,
    startedAt: r.started_at,
    outcome: r.outcome,
  }));
  const open = unfinishedConnect(tries, connectedPlatforms, now, 0);
  if (!open) return null;
  return { id: open.id, platform: open.platform, ...unfinishedTimers(open, now) };
}
