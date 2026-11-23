import "server-only";
import { CLOSED_STATUSES } from "@/features/catch-up";
import type { ServiceClient } from "@/lib/supabase/service";
import type { PopupFacts } from "./popup-copy";
import { scanNumbers } from "./popup-scan";
import { perDayFromWeek, type ReplyPain } from "./reply-pain";

// The brand's own numbers for the upgrade pop-up's honey box, loaded when a pop-up opens (never on
// every page): its connected accounts, its latest catch-up and how busy its inbox is. Counts and
// ids only; message text is read to sort it and never leaves this function (rule 10).

const ITEMS_MAX = 700;
const LOCKED_MAX = 500;

async function loadPain(
  db: ServiceClient,
  tenantId: string,
  needsYou: readonly string[],
  now: Date,
): Promise<ReplyPain> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [week, waiting] = await Promise.all([
    db
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("received_at", since),
    needsYou.length
      ? db
          .from("inbound_items")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", [...needsYou])
      : Promise.resolve({ count: 0 }),
  ]);
  return { perDay: perDayFromWeek(week.count ?? 0), waiting: waiting.count ?? 0 };
}

async function loadScan(db: ServiceClient, tenantId: string): Promise<PopupFacts["scan"]> {
  const { data: cu } = await db
    .from("catch_ups")
    .select("id, social_account_id, platform")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cu) return null;
  const [{ data: items }, { data: locked }, account] = await Promise.all([
    db
      .from("inbound_items")
      .select("kind, category, status, text")
      .eq("catch_up_id", cu.id)
      .limit(ITEMS_MAX),
    cu.social_account_id
      ? db
          .from("missed_messages")
          .select("zernio_conversation_id, category, text")
          .eq("social_account_id", cu.social_account_id)
          .order("received_at", { ascending: false })
          .limit(LOCKED_MAX)
      : Promise.resolve({ data: [] }),
    !cu.platform && cu.social_account_id
      ? db.from("social_accounts").select("platform").eq("id", cu.social_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const platform = cu.platform ?? account.data?.platform ?? null;
  if (!platform) return null;
  const numbers = scanNumbers(
    items ?? [],
    (locked ?? []).map((m) => ({
      conversation: m.zernio_conversation_id,
      category: m.category,
      text: m.text,
    })),
    CLOSED_STATUSES,
  );
  return { platform, ...numbers };
}

/** The open brand's numbers for the pop-up (anything that fails is just left out). */
export async function loadPopupFacts(
  db: ServiceClient,
  input: { orgId: string; tenantId: string; needsYou: readonly string[]; now: Date },
): Promise<Omit<PopupFacts, "usage">> {
  const { tenantId, needsYou, now } = input;
  const [tenant, accounts, scan, pain] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    db
      .from("social_accounts")
      .select("platform")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    loadScan(db, tenantId).catch(() => null),
    loadPain(db, tenantId, needsYou, now).catch(() => null),
  ]);
  return {
    brandName: tenant.data?.name ?? null,
    connected: [...new Set((accounts.data ?? []).map((a) => a.platform))],
    scan,
    pain,
  };
}
