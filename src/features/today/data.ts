import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWork } from "@/features/analytics";
import { loadInbox, loadNextPost, type InboxEntry, type NextPost } from "@/features/approvals";
import { groupGaps, loadGaps } from "@/features/knowledge-base";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;
const DAY_MS = 86_400_000;

export interface TodayData {
  /** Replies Waggle sent on its own in the last 24 hours. */
  answeredOnItsOwn: number;
  newLeads: { name: string | null; request: string | null }[];
  ready: InboxEntry[];
  onlyYou: (InboxEntry & { status: string })[];
  gaps: { text: string; times: number }[];
  week: { answered: number; replySeconds: number | null; leads: number; spamHidden: number };
  accounts: { id: string; platform: string; name: string; working: boolean }[];
  nextPost: NextPost | null;
}

/** Everything on Today, read with the owner's client (RLS scopes it to their brands). */
export async function loadToday(db: Db, tenantId: string, now = new Date()): Promise<TodayData> {
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const [inbox, ownReplies, leads, gapRows, work, hidden, accounts, nextPost] = await Promise.all([
    loadInbox(db, tenantId),
    db
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "sent")
      .is("decided_by", null)
      .gte("sent_at", dayAgo),
    db
      .from("leads")
      .select("name, request")
      .eq("tenant_id", tenantId)
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(20),
    loadGaps(db, tenantId, 50),
    loadWork(db, tenantId, { period: 7, accountIds: null, now }),
    db
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("hidden_on_platform_at", weekAgo),
    db
      .from("social_accounts")
      .select("id, platform, status, username")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "disconnected"])
      .order("created_at"),
    loadNextPost(db, tenantId, now),
  ]);
  return {
    answeredOnItsOwn: ownReplies.count ?? 0,
    newLeads: leads.data ?? [],
    ready: inbox.waiting,
    onlyYou: inbox.needsYou as (InboxEntry & { status: string })[],
    gaps: groupGaps(gapRows),
    week: {
      answered: work.byWaggle + work.byYou,
      replySeconds: work.firstReplyWaggle ?? work.firstReplyYou,
      leads: work.leads,
      spamHidden: hidden.count ?? 0,
    },
    accounts: (accounts.data ?? []).map((a) => ({
      id: a.id,
      platform: a.platform,
      name: a.username ?? a.platform,
      working: a.status === "active",
    })),
    nextPost,
  };
}
