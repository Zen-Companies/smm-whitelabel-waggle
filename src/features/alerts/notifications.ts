import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// The in-app notification center (docs/design.md §5): rows written by DB triggers (alerts, post
// outcomes, auto-sent batches), described here in plain words (§7).

export type NotificationKind =
  | "lead"
  | "needs_you"
  | "account"
  | "replies_waiting"
  | "post_published"
  | "post_failed"
  | "auto_sent";

/** The 36px type circle: lead = coral, problems = amber, sent = success, posts = lavender. */
export type NotificationTone = "lead" | "attention" | "success" | "post";

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  tone: NotificationTone;
  title: string;
  meta: string;
  href: string;
  action: string | null;
  needsAction: boolean;
  unread: boolean;
  at: string;
}

export interface NotificationRow {
  id: string;
  kind: string;
  needs_action: boolean;
  item_id: string | null;
  social_account_id: string | null;
  post_id: string | null;
  details: Record<string, unknown>;
  read_at: string | null;
  updated_at: string;
}

export interface Lookups {
  items: Map<
    string,
    { author: string | null; kind: string; category: string | null; status: string }
  >;
  accounts: Map<string, { platform: string; username: string | null }>;
  posts: Map<string, { content: string; lastError: string | null }>;
  leads: Map<string, { name: string | null; request: string | null }>;
}

const snippet = (text: string, n = 60) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const platform = (p?: string) => (p === "facebook" ? "Facebook" : "Instagram");

/** Pure: one row in plain words, with where it leads. */
export function describeNotification(row: NotificationRow, l: Lookups): NotificationView {
  const base = {
    id: row.id,
    kind: row.kind as NotificationKind,
    needsAction: row.needs_action,
    unread: row.read_at === null,
    at: row.updated_at,
  };
  const item = row.item_id ? l.items.get(row.item_id) : undefined;
  const who = item?.author ?? "A customer";
  const itemHref = row.item_id ? `/inbox/items/${row.item_id}` : "/inbox";
  switch (row.kind) {
    case "lead": {
      const lead = l.leads.get(String(row.details.leadId ?? ""));
      return {
        ...base,
        tone: "lead",
        title: `New lead: ${lead?.name ?? who}`,
        meta: lead?.request ? snippet(lead.request) : "Wants to book, order or get a quote",
        href: itemHref,
        action: "Open",
      };
    }
    case "needs_you": {
      const failed = item?.status === "failed" || row.details.status === "failed";
      return {
        ...base,
        tone: "attention",
        title: failed ? `A reply to ${who} couldn't be sent` : `${who} needs you`,
        meta: failed
          ? "Reply on the platform yourself, then mark it as handled."
          : item?.category === "complaint"
            ? "It looks like a complaint."
            : item?.category === "unclear"
              ? "Waggle couldn't tell what it's about."
              : "Waggle handed it to you.",
        href: itemHref,
        action: "Review",
      };
    }
    case "account": {
      const a = row.social_account_id ? l.accounts.get(row.social_account_id) : undefined;
      return {
        ...base,
        tone: "attention",
        title: `${platform(a?.platform)}${a?.username ? ` @${a.username}` : ""} disconnected`,
        meta: "New messages wait until you reconnect.",
        href: "/settings",
        action: "Reconnect",
      };
    }
    case "replies_waiting": {
      const n = Array.isArray(row.details.draftIds) ? row.details.draftIds.length : 1;
      return {
        ...base,
        tone: "post",
        title: n === 1 ? "A reply is waiting for you" : `${n} replies are waiting for you`,
        meta: "Waiting more than 30 minutes",
        href: "/inbox",
        action: "Review replies",
      };
    }
    case "post_published": {
      const p = row.post_id ? l.posts.get(row.post_id) : undefined;
      return {
        ...base,
        tone: "post",
        title: "Your post is live",
        meta: p ? snippet(p.content) : "",
        href: "/posts",
        action: null,
      };
    }
    case "post_failed": {
      const p = row.post_id ? l.posts.get(row.post_id) : undefined;
      const paused = row.details.failureReason === "zernio_paused";
      return {
        ...base,
        tone: "attention",
        title: paused ? "A post needs a new time" : "A post didn't go out",
        meta: p ? snippet(p.content) : "",
        href: "/posts",
        action: paused ? "Reschedule" : "Fix",
      };
    }
    case "auto_sent": {
      const n = Number(row.details.count ?? 1);
      return {
        ...base,
        tone: "success",
        title: n === 1 ? "1 reply sent automatically" : `${n} replies sent automatically`,
        meta: "From your business info, on auto-send",
        href: "/inbox?tab=sent",
        action: null,
      };
    }
    default:
      return { ...base, tone: "post", title: "Update", meta: "", href: "/inbox", action: null };
  }
}

/** The latest notifications of a tenant, described. Read with the owner's client (RLS). */
export async function loadNotifications(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  limit = 50,
): Promise<NotificationView[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, kind, needs_action, item_id, social_account_id, post_id, details, read_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`notifications load failed: ${error.message}`);
  const rows = (data ?? []) as NotificationRow[];
  const ids = (key: keyof NotificationRow) => [
    ...new Set(rows.map((r) => r[key]).filter((v): v is string => typeof v === "string")),
  ];
  const leadIds = [
    ...new Set(rows.map((r) => r.details.leadId).filter((v): v is string => typeof v === "string")),
  ];

  const [items, accounts, posts, leads] = await Promise.all([
    ids("item_id").length
      ? supabase
          .from("inbound_items")
          .select("id, author_name, kind, category, status")
          .in("id", ids("item_id"))
      : { data: [] },
    ids("social_account_id").length
      ? supabase
          .from("social_accounts")
          .select("id, platform, username")
          .in("id", ids("social_account_id"))
      : { data: [] },
    ids("post_id").length
      ? supabase.from("posts").select("id, content, last_error").in("id", ids("post_id"))
      : { data: [] },
    leadIds.length
      ? supabase.from("leads").select("id, name, request").in("id", leadIds)
      : { data: [] },
  ]);
  const lookups: Lookups = {
    items: new Map(
      (items.data ?? []).map((i) => [
        i.id,
        { author: i.author_name, kind: i.kind, category: i.category, status: i.status },
      ]),
    ),
    accounts: new Map(
      (accounts.data ?? []).map((a) => [a.id, { platform: a.platform, username: a.username }]),
    ),
    posts: new Map(
      (posts.data ?? []).map((p) => [p.id, { content: p.content, lastError: p.last_error }]),
    ),
    leads: new Map((leads.data ?? []).map((x) => [x.id, { name: x.name, request: x.request }])),
  };
  return rows.map((r) => describeNotification(r, lookups));
}

/** The bell's badge: unread notifications that need the owner (§5). */
export async function countUnreadNeedingAction(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("needs_action", true)
    .is("read_at", null);
  return count ?? 0;
}
