import type { createServerSupabase } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createServerSupabase>>;

export type CatchUpSummary = {
  id: string;
  platform: string;
  username: string | null;
  finished: boolean;
  comments: number;
  dms: number;
  missed: number;
};

/** The oldest catch-up the owner hasn't dismissed (read with their own client, through RLS). */
export async function loadCatchUp(db: Db, tenantId: string): Promise<CatchUpSummary | null> {
  const { data: row } = await db
    .from("catch_ups")
    .select("id, social_account_id, stage, comments_created, dms_created")
    .eq("tenant_id", tenantId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // The account was deleted from Waggle (the catch-up row stays, keyed on the real account).
  if (!row?.social_account_id) return null;
  const [{ data: account }, { count }] = await Promise.all([
    db
      .from("social_accounts")
      .select("platform, username")
      .eq("id", row.social_account_id)
      .maybeSingle(),
    db
      .from("missed_messages")
      .select("id", { count: "exact", head: true })
      .eq("social_account_id", row.social_account_id),
  ]);
  if (!account) return null;
  return {
    id: row.id,
    platform: account.platform,
    username: account.username,
    finished: row.stage === "done",
    comments: row.comments_created,
    dms: row.dms_created,
    missed: count ?? 0,
  };
}

export type MissedMessage = {
  id: string;
  platform: string;
  senderName: string | null;
  text: string;
  receivedAt: string;
};

/** Unanswered DMs too old to answer, newest first (read-only list). */
export async function loadMissedMessages(db: Db, tenantId: string): Promise<MissedMessage[]> {
  const { data: rows } = await db
    .from("missed_messages")
    .select("id, social_account_id, sender_name, text, received_at")
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false })
    .limit(500);
  if (!rows?.length) return [];
  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, platform")
    .in("id", [...new Set(rows.map((r) => r.social_account_id))]);
  const platformOf = new Map((accounts ?? []).map((a) => [a.id, a.platform]));
  return rows.map((r) => ({
    id: r.id,
    platform: platformOf.get(r.social_account_id) ?? "instagram",
    senderName: r.sender_name,
    text: r.text,
    receivedAt: r.received_at,
  }));
}
