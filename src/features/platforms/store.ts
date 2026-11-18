import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { getServiceClient } from "@/lib/supabase/service";
import { resolveStatus, SWITCHABLE, type PlatformStatus } from "./catalog";

type ServiceClient = ReturnType<typeof getServiceClient>;

export interface PlatformRow {
  status: PlatformStatus;
  lastSignin: "welcome" | "platform" | null;
  lastSigninAt: string | null;
}

/** What owners see for every platform on Staff → Platforms (stored choice or the default). */
export async function loadPlatformStatuses(
  db: ServiceClient,
): Promise<Map<string, PlatformStatus>> {
  const rows = await loadPlatformRows(db);
  return new Map([...rows].map(([id, r]) => [id, r.status]));
}

export async function loadPlatformRows(db: ServiceClient): Promise<Map<string, PlatformRow>> {
  const { data, error } = await db
    .from("platform_settings")
    .select("platform, status, last_signin, last_signin_at");
  if (error) {
    // Fall back to the defaults (what owners saw before this page) rather than breaking Settings.
    Sentry.captureException(new Error(`platform_settings read failed: ${error.message}`));
  }
  const byId = new Map((data ?? []).map((r) => [r.platform, r]));
  return new Map(
    SWITCHABLE.map((p) => {
      const r = byId.get(p.id);
      const signin =
        r?.last_signin === "welcome" || r?.last_signin === "platform" ? r.last_signin : null;
      return [
        p.id,
        {
          status: resolveStatus(p, r?.status),
          lastSignin: signin,
          lastSigninAt: r?.last_signin_at ?? null,
        },
      ];
    }),
  );
}

/**
 * Remembers what the platform's sign-in showed on the latest connect, for Staff → Platforms.
 * Best effort: never blocks a connect.
 */
export async function recordSignin(
  db: ServiceClient,
  platform: string,
  signin: "welcome" | "platform",
): Promise<void> {
  const def = SWITCHABLE.find((p) => p.id === platform);
  if (!def) return;
  const now = new Date().toISOString();
  const { data } = await db
    .from("platform_settings")
    .update({ last_signin: signin, last_signin_at: now })
    .eq("platform", platform)
    .select("platform");
  if (data?.length) return;
  // No row yet: store the default status with it (insert only, never overwriting a choice).
  await db.from("platform_settings").upsert(
    {
      platform,
      status: resolveStatus(def, null),
      last_signin: signin,
      last_signin_at: now,
      updated_at: now,
    },
    { onConflict: "platform", ignoreDuplicates: true },
  );
}
