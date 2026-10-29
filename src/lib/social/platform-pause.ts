import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

// T19: Zernio pauses the whole team on a failed payment (402 PAYMENT_REQUIRED on every call,
// docs.zernio.com/multi-tenant). That's platform state, kept in platform_state['zernio_pause']:
// sends wait (no attempts counted, nothing escalated), the operator is alerted once, and the job
// route probes Zernio until a call succeeds again.

const KEY = "zernio_pause";
/** How long work that needs Zernio waits before trying again while paused. */
export const PLATFORM_PAUSE_RETRY_SECONDS = 300;
/** At most one probe call per this interval while paused. */
export const PLATFORM_PAUSE_PROBE_MS = 5 * 60 * 1000;

export interface PlatformPause {
  pausedAt: string;
  operatorAlertedAt: string | null;
  lastProbeAt: string | null;
}

export async function getPlatformPause(db: ServiceClient): Promise<PlatformPause | null> {
  const { data, error } = await db
    .from("platform_state")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw new Error(`platform_state read failed: ${error.message}`);
  const v = data?.value as Partial<PlatformPause> | undefined;
  return v?.pausedAt
    ? {
        pausedAt: v.pausedAt,
        operatorAlertedAt: v.operatorAlertedAt ?? null,
        lastProbeAt: v.lastProbeAt ?? null,
      }
    : null;
}

async function write(db: ServiceClient, value: PlatformPause | Record<string, never>) {
  const { error } = await db
    .from("platform_state")
    .upsert({ key: KEY, value: value as unknown as Json, updated_at: new Date().toISOString() });
  if (error) throw new Error(`platform_state write failed: ${error.message}`);
}

/** A call got 402 PAYMENT_REQUIRED. Keeps the first pausedAt if already paused. */
export async function recordPlatformPause(db: ServiceClient, now = new Date()): Promise<void> {
  if (await getPlatformPause(db)) return;
  await write(db, {
    pausedAt: now.toISOString(),
    operatorAlertedAt: null,
    // A pause seen just now: no point probing for a while.
    lastProbeAt: now.toISOString(),
  });
}

export async function updatePlatformPause(db: ServiceClient, patch: Partial<PlatformPause>) {
  const current = await getPlatformPause(db);
  if (current) await write(db, { ...current, ...patch });
}

export async function clearPlatformPause(db: ServiceClient): Promise<void> {
  await write(db, {});
}
