import "server-only";
import { platformLabel } from "@/lib/social/platforms";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { businessZone, checkNowOpen, nextMondayRun } from "./schedule";
import { parseWeekSummary, type WeekSummary } from "./summary";

// What Today's "Your week" card reads (board "Your week", approved 26 Nov): the latest finished
// check-up's stored numbers (no AI), the one running now, and whether Check now can be used today.
// Read with the service client after the caller has checked the open brand (getCurrentTenant).

export interface WeekRunView {
  trigger: "monday" | "check_now";
  from: string;
  to: string;
  finishedAt: string;
  summary: WeekSummary;
}

export interface WeekProgress {
  runId: string;
  done: number;
  total: number;
  /** The accounts still to read, by platform name. */
  reading: string[];
}

export interface WeekCardData {
  latest: WeekRunView | null;
  active: WeekProgress | null;
  checkNow: { open: boolean; lastAt: string | null };
  /** When the next Monday check-up runs. */
  nextRun: string;
}

type ProgressAccount = { platform?: unknown; done?: unknown };

export function progressOf(runId: string, raw: Json): WeekProgress {
  const accounts = (Array.isArray(raw) ? raw : []) as ProgressAccount[];
  const left = accounts.filter((a) => a.done !== true);
  return {
    runId,
    done: accounts.length - left.length,
    total: accounts.length,
    reading: [
      ...new Set(
        left.map((a) => (typeof a.platform === "string" ? platformLabel(a.platform) : "")),
      ),
    ].filter(Boolean),
  };
}

export async function businessZoneOf(db: ServiceClient, tenantId: string): Promise<string> {
  const { data: tenant } = await db
    .from("tenants")
    .select("organization_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.organization_id) return businessZone(null);
  const { data: bill } = await db
    .from("org_billing")
    .select("time_zone")
    .eq("organization_id", tenant.organization_id)
    .maybeSingle();
  return businessZone(bill?.time_zone ?? null);
}

export async function loadWeekCard(
  db: ServiceClient,
  tenantId: string,
  now = new Date(),
): Promise<WeekCardData> {
  const [latest, active, lastCheck, zone] = await Promise.all([
    db
      .from("weekly_checks")
      .select("trigger, window_start, window_end, finished_at, summary")
      .eq("tenant_id", tenantId)
      .eq("status", "done")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("weekly_checks")
      .select("id, accounts")
      .eq("tenant_id", tenantId)
      .in("status", ["queued", "running"])
      .maybeSingle(),
    db
      .from("weekly_checks")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .eq("trigger", "check_now")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    businessZoneOf(db, tenantId),
  ]);
  const summary = parseWeekSummary(latest.data?.summary);
  const lastAt = lastCheck.data?.created_at ?? null;
  return {
    latest:
      latest.data && summary && latest.data.finished_at
        ? {
            trigger: latest.data.trigger === "monday" ? "monday" : "check_now",
            from: latest.data.window_start,
            to: latest.data.window_end,
            finishedAt: latest.data.finished_at,
            summary,
          }
        : null,
    active: active.data ? progressOf(active.data.id, active.data.accounts) : null,
    checkNow: { open: checkNowOpen(lastAt ? new Date(lastAt) : null, now, zone), lastAt },
    nextRun: nextMondayRun(now, zone).toISOString(),
  };
}

export type RunResult =
  | { status: "checking"; progress: WeekProgress }
  | { status: "done"; found: number; failed: string[]; finishedAt: string }
  | { status: "failed" };

/** One run's state, for Check now's polling. */
export async function loadRunResult(
  db: ServiceClient,
  tenantId: string,
  runId: string,
): Promise<RunResult | null> {
  const { data } = await db
    .from("weekly_checks")
    .select("id, status, accounts, summary, finished_at")
    .eq("tenant_id", tenantId)
    .eq("id", runId)
    .maybeSingle();
  if (!data) return null;
  if (data.status === "queued" || data.status === "running") {
    return { status: "checking", progress: progressOf(data.id, data.accounts) };
  }
  const summary = parseWeekSummary(data.summary);
  if (data.status !== "done" || !summary) return { status: "failed" };
  return {
    status: "done",
    found: summary.found,
    failed: summary.accounts
      .filter((a) => a.state === "failed")
      .map((a) => platformLabel(a.platform)),
    finishedAt: data.finished_at ?? new Date().toISOString(),
  };
}
