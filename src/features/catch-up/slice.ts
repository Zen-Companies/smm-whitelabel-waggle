import { processDueItems, type Steps } from "@/features/inbox";
import { claimItem, type ClaimedItem, type Deadline } from "@/lib/jobs";
import type { LlmClient } from "@/lib/llm/client";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { finishCatchUps } from "./finish";
import { runCatchUps } from "./job";
import { loadCatchUpProgress, type CatchUpPhase } from "./reveal-data";

// First connect (20 Nov): one invocation of /api/jobs/catch-up for one brand. Reads (the catch-up
// job), sorts and drafts what it pulled (the ordinary steps, on this brand's pulled items only),
// and picks the reveal's drafts and top questions when sorting is done. The once-a-minute job
// does the same for everyone; this only makes the first connect fast.

/** The pulled items to work on first: due, unlocked, newest first. Claimed one by one. */
const CLAIM_BATCH = 10;

export function claimPulledItems(tenantId: string) {
  return async (db: ServiceClient, limit: number, statuses: string[]): Promise<ClaimedItem[]> => {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data, error } = await db
      .from("inbound_items")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .not("catch_up_id", "is", null)
      .in("status", statuses)
      .or(`next_run_at.is.null,next_run_at.lte.${now}`)
      .or(`locked_at.is.null,locked_at.lt.${stale}`)
      .order("received_at", { ascending: false })
      .limit(Math.min(limit, CLAIM_BATCH));
    if (error) throw new Error(`pulled items lookup failed: ${error.message}`);
    const claimed: ClaimedItem[] = [];
    for (const row of data ?? []) {
      const item = await claimItem(db, row.id, row.status);
      if (item) claimed.push(item);
    }
    return claimed;
  };
}

export async function runCatchUpSlice(
  deps: {
    db: ServiceClient;
    social: () => SocialProvider;
    llm: LlmClient | null;
    /** The production steps; sending is left to the job. */
    steps: Steps;
    deadline: Deadline;
    /**
     * Walter's flow (decision 7): the business info found on the account, once it's read
     * (knowledge-base's findFactsAfterConnect, passed in by the route). Before the drafts, so
     * the reveal's drafts can use it.
     */
    findFacts?: (tenantId: string, shouldContinue: () => boolean) => Promise<unknown>;
  },
  tenantId: string,
): Promise<{ phase: CatchUpPhase | null }> {
  const { db, deadline } = deps;
  const time = (ms: number) => () => deadline.remainingMs() > ms;
  await runCatchUps(
    { db, social: deps.social, shouldContinue: time(25_000) },
    { tenantId, limit: 1 },
  );
  if (deps.findFacts && time(25_000)()) {
    try {
      await deps.findFacts(tenantId, time(20_000));
    } catch {
      // Reported by the caller's own handler; the slice goes on.
    }
  }
  const steps: Steps = {
    ...(deps.steps.new ? { new: deps.steps.new } : {}),
    ...(deps.steps.classified ? { classified: deps.steps.classified } : {}),
    ...(deps.steps.drafted ? { drafted: deps.steps.drafted } : {}),
  };
  const claim = claimPulledItems(tenantId);
  await processDueItems({ db, steps, deadline, claim });
  if (time(10_000)()) {
    await finishCatchUps({ db, llm: deps.llm, shouldContinue: time(10_000) }, { tenantId });
  }
  // Drafts picked just now are written in the same invocation while there's time.
  if (deadline.canClaim()) await processDueItems({ db, steps, deadline, claim });
  const progress = await loadCatchUpProgress(db, tenantId);
  return { phase: progress?.phase ?? null };
}
