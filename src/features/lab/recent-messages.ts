import "server-only";
import { loadThreadHistory } from "@/features/drafting";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { practiceCard, thenText, type PracticeCard } from "./practice-copy";
import { loadTenantSnapshot, runVariant } from "./run";
import { currentVariant } from "./variants";

// "Your recent messages" (T36 item 3). Reads the business's last real messages and their drafts,
// runs each through today's setup (recorded as practice) and stores the try. It never writes to
// inbound_items or drafts and never sends: the real messages are only read.

/** How many real messages one run takes at most. */
export const RECENT_MESSAGES = 5;

export interface RecentMessageResult {
  itemId: string;
  who: string;
  kind: "comment" | "dm";
  receivedAt: string;
  text: string;
  card: PracticeCard;
  then: string;
}

export async function recentMessagesFor(
  db: ServiceClient,
  input: { tenantId: string; userId: string; limit: number },
  deps: { run?: typeof runVariant } = {},
): Promise<RecentMessageResult[]> {
  const run = deps.run ?? runVariant;
  const { data: items } = await db
    .from("inbound_items")
    .select("id, kind, text, author_name, received_at, status")
    .eq("tenant_id", input.tenantId)
    .order("received_at", { ascending: false })
    .limit(input.limit);
  if (!items?.length) return [];

  const { data: drafts } = await db
    .from("drafts")
    .select("item_id, decided_by, edited_body, created_at")
    .in(
      "item_id",
      items.map((i) => i.id),
    )
    .order("created_at", { ascending: false });
  const latest = new Map<string, NonNullable<typeof drafts>[number]>();
  for (const d of drafts ?? []) if (!latest.has(d.item_id)) latest.set(d.item_id, d);

  const snapshot = await loadTenantSnapshot(db, input.tenantId);
  const results: RecentMessageResult[] = [];
  for (const item of items) {
    const kind = item.kind as "comment" | "dm";
    // A DM is drafted with its earlier messages, as in production (T30); comments have none.
    const history = kind === "dm" ? await loadThreadHistory(db, item.id) : [];
    const tried = await run(db, {
      tenant: snapshot,
      text: item.text,
      kind,
      variant: currentVariant(),
      source: "practice",
      stopAfter: "policy",
      history,
    });
    await db.from("lab_runs").insert({
      tenant_id: input.tenantId,
      created_by: input.userId,
      kind,
      text: item.text,
      origin: "owner",
      results: { practice: tried, recentItemId: item.id } as unknown as Json,
    });
    const d = latest.get(item.id);
    results.push({
      itemId: item.id,
      who: item.author_name ?? "A customer",
      kind,
      receivedAt: item.received_at,
      text: item.text,
      card: practiceCard(tried.result),
      then: thenText(
        item.status,
        d ? { decidedByOwner: d.decided_by !== null, edited: d.edited_body !== null } : null,
      ),
    });
  }
  return results;
}
