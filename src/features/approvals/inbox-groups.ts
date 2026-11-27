// Inbox by sender (approved 26 Nov, board "Inbox: one row per conversation"): what the list's
// filters, sort and groups mean. Pure: no I/O.

export const INBOX_TYPES = [
  { key: "dm", label: "DMs" },
  { key: "comment", label: "Comments" },
  { key: "email", label: "Email" },
  { key: "review", label: "Reviews" },
] as const;
export type InboxType = (typeof INBOX_TYPES)[number]["key"];

export const INBOX_FLAGS = [
  { key: "needs", label: "Needs you" },
  { key: "ready", label: "Draft ready" },
  { key: "failed", label: "Couldn't be sent" },
  { key: "leads", label: "Leads" },
  { key: "complaints", label: "Complaints" },
  { key: "unread", label: "Unread" },
] as const;
export type InboxFlag = (typeof INBOX_FLAGS)[number]["key"];

export type InboxSort = "priority" | "newest";

export interface InboxFilters {
  platforms: string[];
  types: InboxType[];
  flags: InboxFlag[];
  /** On by default: newsletters, no-reply and automated senders leave the list (email only). */
  customersOnly: boolean;
  sort: InboxSort;
  /** Posts Round 5: only the comments on this post (a Waggle post id), from "See comments in Inbox". */
  post: string | null;
}

export const DEFAULT_FILTERS: InboxFilters = {
  platforms: [],
  types: [],
  flags: [],
  customersOnly: true,
  sort: "priority",
  post: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;

function list(params: Params, key: string): string[] {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return [
    ...new Set(
      value
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Pure: the filters in the address (?platform=google&type=email&status=failed&sort=newest). */
export function parseInboxFilters(params: Params): InboxFilters {
  const types = INBOX_TYPES.map((t) => t.key as string);
  const flags = INBOX_FLAGS.map((f) => f.key as string);
  return {
    platforms: list(params, "platform")
      .filter((p) => /^[a-z]{2,20}$/.test(p))
      .slice(0, 12),
    types: list(params, "type").filter((t) => types.includes(t)) as InboxType[],
    flags: list(params, "status").filter((f) => flags.includes(f)) as InboxFlag[],
    customersOnly: params.customers !== "all",
    sort: params.sort === "newest" ? "newest" : "priority",
    post:
      typeof params.post === "string" && UUID.test(params.post) ? params.post.toLowerCase() : null,
  };
}

/** Pure: the query values for `filters`, leaving out the defaults (the address stays short). */
export function filterParams(filters: InboxFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.platforms.length) out.platform = filters.platforms.join(",");
  if (filters.types.length) out.type = filters.types.join(",");
  if (filters.flags.length) out.status = filters.flags.join(",");
  if (!filters.customersOnly) out.customers = "all";
  if (filters.sort === "newest") out.sort = "newest";
  if (filters.post) out.post = filters.post;
  return out;
}

/** Pure: how many filters are on, for "Filters 2" (the sort and the default don't count). */
export function activeFilterCount(filters: InboxFilters): number {
  return (
    filters.platforms.length +
    filters.types.length +
    filters.flags.length +
    (filters.customersOnly ? 0 : 1) +
    (filters.post ? 1 : 0)
  );
}

/** Pure: `filters` with one value of one dimension switched on or off. */
export function toggleFilter(
  filters: InboxFilters,
  dimension: "platforms" | "types" | "flags",
  value: string,
): InboxFilters {
  const current = filters[dimension] as string[];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...filters, [dimension]: next };
}

/** The type of a message as the Type filter names it. */
export function inboxType(kind: string, email: boolean): InboxType | "call" {
  if (kind === "dm") return email ? "email" : "dm";
  if (kind === "comment" || kind === "review") return kind;
  return "call";
}

export type PriorityGroup = "now" | "ready" | "also";

export const GROUP_LABELS: Record<PriorityGroup, string> = {
  now: "Needs you now",
  ready: "Ready to approve",
  also: "Also for you",
};

/** A DM whose reply window closes within this long needs the owner now. */
export const CLOSING_SOON_MS = 3 * 60 * 60 * 1000;

/**
 * Pure: the group a For you row sits in. The server ranks it (1: a complaint or bad review, a
 * lead, or couldn't be sent; 2: a reply ready to approve; 3: the rest); a DM whose reply window
 * closes within 3 hours moves up to Needs you now.
 */
export function priorityGroup(
  row: { rank: number; dmWindowClosesAt: string | null },
  now: Date,
): PriorityGroup {
  if (row.rank === 1) return "now";
  if (row.dmWindowClosesAt) {
    const left = Date.parse(row.dmWindowClosesAt) - now.getTime();
    if (left > 0 && left <= CLOSING_SOON_MS) return "now";
  }
  return row.rank === 2 ? "ready" : "also";
}

const ORDER: Record<PriorityGroup, number> = { now: 0, ready: 1, also: 2 };

/**
 * Pure: the list's order. Priority: Needs you now, Ready to approve, Also for you, newest message
 * first inside each; Newest: by the latest message only.
 */
export function orderConversations<
  T extends { rank: number; dmWindowClosesAt: string | null; latestAt: string; groupKey: string },
>(rows: readonly T[], sort: InboxSort, now: Date): (T & { group: PriorityGroup })[] {
  const withGroup = rows.map((r) => ({ ...r, group: priorityGroup(r, now) }));
  return withGroup.sort((a, b) => {
    if (sort === "priority" && a.group !== b.group) return ORDER[a.group] - ORDER[b.group];
    if (a.latestAt !== b.latestAt) return a.latestAt < b.latestAt ? 1 : -1;
    return a.groupKey.localeCompare(b.groupKey);
  });
}

/** Pure: "2 h left", "40 min left" on a DM row; null once closed or when there's no window. */
export function windowLeft(closesAt: string | null, now: Date): string | null {
  if (!closesAt) return null;
  const ms = Date.parse(closesAt) - now.getTime();
  if (!(ms > 0)) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min left`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h left` : `${Math.floor(hours / 24)} days left`;
}

/** Pure: the count beside a name ("3 new"), and how many subjects or posts the row spans. */
export function rowCountLabel(row: {
  newMessages: number;
  threads: number;
  posts: number;
  kind: string;
  email: boolean;
}): string | null {
  const parts: string[] = [];
  if (row.newMessages > 0) parts.push(`${row.newMessages} new`);
  if (row.email && row.threads > 1) parts.push(`${row.threads} subjects`);
  if (row.kind === "comment" && row.posts > 1) parts.push(`${row.posts} posts`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Posts Round 5: the ids a post's comments carry. Comments name the platform's post id
 * (`inbound_items.zernio_post_id` holds the webhook's platformPostId), so the post's Zernio id and
 * the platform ids Waggle's results copy has for it (`post_metrics.provider_post_id`) both count.
 */
export function postCommentIds(
  zernioPostId: string | null,
  metrics: readonly { provider_post_id: string }[],
): string[] {
  return [
    ...new Set([
      ...(zernioPostId ? [zernioPostId] : []),
      ...metrics.map((m) => m.provider_post_id),
    ]),
  ].filter(Boolean);
}

/** The honey chip for a post filter: "Post: Black Friday at Harbo…". */
export function postChipLabel(content: string): string {
  const line = content.split("\n")[0].trim() || "Photo";
  return `Post: ${line.length > 24 ? `${line.slice(0, 24).trimEnd()}…` : line}`;
}
