import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ServiceClient } from "@/lib/supabase/service";
import { examplesFromTopics } from "./examples";
import { practiceCard, type PracticeCard } from "./practice-copy";
import { practiceTriesLeft } from "./practice-limit";
import type { VariantRun } from "./run";
import { setupSteps, type SetupStep } from "./setup";

// What the owner's Lab shows (T36): tries left, examples from their topics, their recent tries
// and the first-day checklist. Business data through RLS; tries (lab_runs) by tenant id with the
// service role, since owners have no client access to that table.

export interface RecentTry {
  id: string;
  text: string;
  kind: "comment" | "dm";
  at: string;
  card: PracticeCard;
}

export interface PracticePage {
  triesLeft: number;
  examples: string[];
  /** false: generic examples, because the business has no topics yet. */
  examplesFromTopics: boolean;
  recentTries: RecentTry[];
  setup: SetupStep[];
}

export async function loadPracticePage(db: ServiceClient, tenantId: string): Promise<PracticePage> {
  const supabase = await createServerSupabase();
  const [
    triesLeft,
    { data: topics },
    { count: accounts },
    { data: tenant },
    { data: runs },
    { count: tries },
  ] = await Promise.all([
    practiceTriesLeft(db, tenantId),
    supabase.from("kb_entries").select("title").eq("tenant_id", tenantId).order("created_at"),
    supabase
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase.from("tenants").select("business_profile, created_at").eq("id", tenantId).single(),
    db
      .from("lab_runs")
      .select("id, text, kind, created_at, results")
      .eq("tenant_id", tenantId)
      .eq("origin", "owner")
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("lab_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("origin", "owner"),
  ]);

  const recentTries: RecentTry[] = [];
  for (const r of runs ?? []) {
    const run = (r.results as { practice?: VariantRun } | null)?.practice;
    if (!run) continue;
    recentTries.push({
      id: r.id,
      text: r.text,
      kind: r.kind as "comment" | "dm",
      at: r.created_at,
      card: practiceCard(run.result),
    });
  }

  return {
    triesLeft,
    examples: examplesFromTopics((topics ?? []).map((t) => t.title)),
    examplesFromTopics: (topics?.length ?? 0) > 0,
    recentTries,
    setup: setupSteps({
      accountsConnected: accounts ?? 0,
      topics: topics?.length ?? 0,
      hasProfile: !!tenant?.business_profile?.trim(),
      tries: tries ?? 0,
      daysSinceSignup: tenant
        ? (Date.now() - new Date(tenant.created_at).getTime()) / (24 * 3_600_000)
        : 0,
    }),
  };
}
