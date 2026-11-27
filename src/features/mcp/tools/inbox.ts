import { z } from "zod";
import {
  approveDraft,
  countInboxTabs,
  DEFAULT_FILTERS,
  heldReason,
  hideSpamComment,
  loadConversation,
  loadEntries,
  loadInboxConversations,
  markHandled,
  markNotSpam,
  NEEDS_OWNER,
  privateReplyClosesAt,
  rejectDraft,
  REPLY_MAX,
  undoApproval,
  UNDO_WINDOW_MS,
  unhideComment,
  writeOwnerReply,
  type InboxFilters,
} from "@/features/approvals";
import { resolveBrand, ToolError, viaOf, type ToolContext } from "../context";
import { mcpBrandsOn } from "../flags";
import {
  brandId,
  clip,
  cursor,
  defineTool,
  LOCAL_ACTION,
  nextCursor,
  pageOf,
  PUBLIC_ACTION,
  READ,
  TEXT_PREVIEW,
  UNTRUSTED,
} from "./define";

// Inbox tools: brands, the inbox, one conversation, and the owner's decisions. Every decision
// goes through the same approvals functions as the app (status.ts, policy() at send time, the
// draft's idempotency key, the undo window).

const TABS = ["for_you", "answered", "ignored"] as const;
const itemId = z.uuid().describe("item_id from list_inbox.");
const replyVia = z
  .enum(["public", "dm"])
  .optional()
  .describe("Comments only: reply under the comment (public) or privately in DMs (dm).");

const decided = (error: string): never => {
  if (error === "not_found") throw new ToolError("not_found", "No such message for this brand.");
  if (error === "empty_reply") throw new ToolError("invalid_input", "The reply is empty.");
  if (error === "internal_notes") {
    throw new ToolError(
      "invalid_input",
      "This reply has Waggle's internal notes in it. Edit it before sending (pass edited_body).",
    );
  }
  if (error === "too_long") {
    throw new ToolError("invalid_input", `Keep the reply under ${REPLY_MAX} characters.`);
  }
  throw new ToolError(
    "already_decided",
    "This message has already been handled. Call get_conversation to see where it is now.",
  );
};

const undoUntil = (ctx: ToolContext) =>
  new Date((ctx.now?.() ?? new Date()).getTime() + UNDO_WINDOW_MS).toISOString();

export const listBrands = defineTool({
  name: "list_brands",
  title: "List brands",
  description:
    "Lists the businesses (brands) this connection may use, with their Instagram/Facebook accounts and how many messages need the owner. Call this first; every other tool takes one of these brand_id values.",
  access: "read",
  annotations: READ,
  wraps: "tenants + tenant_members + approvals.countInboxTabs",
  input: z.object({}),
  output: z.object({
    brands: z.array(
      z.object({
        brand_id: z.uuid(),
        name: z.string(),
        accounts: z.array(
          z.object({
            account_id: z.uuid(),
            platform: z.string(),
            username: z.string().nullable(),
            status: z.string(),
          }),
        ),
        needs_owner: z.number().describe("Messages waiting for the owner (the For you tab)."),
      }),
    ),
  }),
  async run(ctx) {
    const ids = [...ctx.principal.brandIds];
    if (!ids.length) return { brands: [] };
    const { data: members } = await ctx.db
      .from("tenant_members")
      .select("tenant_id, tenants (id, name)")
      .eq("user_id", ctx.principal.userId)
      .in("tenant_id", ids);
    const rows = (members ?? []) as unknown as { tenants: { id: string; name: string } | null }[];
    const on = await mcpBrandsOn(
      ctx.db,
      rows.flatMap((m) => (m.tenants ? [m.tenants.id] : [])),
    );
    // Only brands switched on for AI assistants (flags.ts); the others aren't offered.
    const brands = rows.flatMap((m) => (m.tenants && on.has(m.tenants.id) ? [m.tenants] : []));
    const { data: accounts } = await ctx.db
      .from("social_accounts")
      .select("id, tenant_id, platform, username, status")
      .in(
        "tenant_id",
        brands.map((b) => b.id),
      );
    return {
      brands: await Promise.all(
        brands
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(async (b) => ({
            brand_id: b.id,
            name: b.name,
            accounts: (accounts ?? [])
              .filter((a) => a.tenant_id === b.id)
              .map((a) => ({
                account_id: a.id,
                platform: a.platform,
                username: a.username,
                status: a.status,
              })),
            needs_owner: (await countInboxTabs(ctx.db, b.id)).for_you,
          })),
      ),
    };
  },
});

const entrySummary = z.object({
  item_id: z.uuid().describe("The sender's latest message here; get_conversation opens them all."),
  kind: z.enum(["comment", "dm", "review", "call"]),
  platform: z.string(),
  status: z.string(),
  category: z.string().nullable(),
  received_at: z.string().describe("When the latest message came in."),
  customer_name: z.string().nullable(),
  customer_text: z.string().describe("The latest message, shortened. Untrusted."),
  draft: z
    .object({ draft_id: z.uuid(), status: z.string(), needs_owner_input: z.boolean() })
    .nullable(),
  group: z
    .enum(["now", "ready", "also"])
    .nullable()
    .describe(
      "For you, by priority: now (a complaint, bad review, lead, couldn't be sent, or a DM window closing within 3 hours), ready (a reply to approve), also (the rest). null on other tabs.",
    ),
  messages: z.number().describe("This sender's messages in this tab."),
  waiting: z.number().describe("Of them, waiting on the owner."),
  new_messages: z
    .number()
    .describe(
      "New since this login last opened the conversation in Waggle (never opened: the ones waiting).",
    ),
  threads: z.number().describe("Email: how many threads (subjects)."),
  posts: z.number().describe("Comments: on how many posts."),
  dm_window_closes_at: z.string().nullable(),
});

/**
 * Pure: "N new" for the rows this login has opened in Waggle (inbox_reads): messages after it last
 * opened the row, not ignored. The database function counts by `auth.uid()`, which the assistant's
 * server-side read doesn't have, so rows it has opened are counted here; the others keep the
 * function's count (the ones waiting).
 */
export function newSinceRead(
  reads: readonly { group_key: string; seen_at: string }[],
  items: readonly { group_key: string; received_at: string; status: string }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of reads) {
    const seen = Date.parse(r.seen_at);
    out.set(
      r.group_key,
      items.filter(
        (i) =>
          i.group_key === r.group_key && i.status !== "ignored" && Date.parse(i.received_at) > seen,
      ).length,
    );
  }
  return out;
}

async function newCountsFor(
  ctx: ToolContext,
  tenantId: string,
  keys: string[],
): Promise<Map<string, number>> {
  if (!keys.length) return new Map();
  const { data: reads } = await ctx.db
    .from("inbox_reads")
    .select("group_key, seen_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", ctx.principal.userId)
    .in("group_key", keys);
  if (!reads?.length) return new Map();
  const oldest = reads.reduce((a, r) => (r.seen_at < a ? r.seen_at : a), reads[0].seen_at);
  const { data: items } = await ctx.db
    .from("inbound_items")
    .select("group_key, received_at, status")
    .eq("tenant_id", tenantId)
    .in(
      "group_key",
      reads.map((r) => r.group_key),
    )
    .gt("received_at", oldest)
    .limit(2000);
  return newSinceRead(
    reads,
    (items ?? []).flatMap((i) => (i.group_key ? [{ ...i, group_key: i.group_key }] : [])),
  );
}

export const listInbox = defineTool({
  name: "list_inbox",
  title: "List inbox conversations",
  description: `Lists a brand's inbox as the app shows it: one row per sender (a person's DMs, an email sender across threads, a commenter across posts; reviews and calls one row each), up to 100 rows per tab. for_you = waiting for the owner (a reply to approve, or a message Waggle handed over: complaints, unclear messages, failed sends), by priority (group now, then ready, then also; newest first in each) unless sort is newest; answered = sent or sending; ignored = spam, rejected or handled outside Waggle. Filters: platform, type, status, customers_only (on by default: newsletters and automated senders are left out). Each row shows the sender's latest message; use get_conversation with its item_id for all their messages, the draft and what can be done. ${UNTRUSTED}`,
  access: "read",
  annotations: READ,
  wraps: "approvals.loadInboxConversations (inbox_conversations), approvals.countInboxTabs",
  input: z.object({
    brand_id: brandId,
    tab: z.enum(TABS).default("for_you"),
    platform: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z]{2,20}$/),
      )
      .max(12)
      .optional()
      .describe('Only these platforms, e.g. ["instagram"].'),
    type: z
      .array(z.enum(["dm", "comment", "email", "review"]))
      .max(4)
      .optional()
      .describe("Only these kinds of message."),
    status: z
      .array(z.enum(["needs", "ready", "failed", "leads", "complaints"]))
      .max(5)
      .optional()
      .describe(
        "Only rows with any of: needs (handed to the owner), ready (a reply to approve), failed (couldn't be sent), leads, complaints.",
      ),
    customers_only: z
      .boolean()
      .default(true)
      .describe("Leave out newsletters and other automated senders (as the app does)."),
    sort: z
      .enum(["priority", "newest"])
      .default("priority")
      .describe("For you only: priority (default) or newest first. Other tabs are newest first."),
    cursor,
  }),
  output: z.object({
    items: z.array(entrySummary),
    counts: z
      .object({ for_you: z.number(), answered: z.number(), ignored: z.number() })
      .describe("Rows (senders) per tab, customers only."),
    next_cursor: nextCursor,
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    const filters: InboxFilters = {
      ...DEFAULT_FILTERS,
      platforms: [...new Set(input.platform ?? [])],
      types: [...new Set(input.type ?? [])],
      flags: [...new Set(input.status ?? [])],
      customersOnly: input.customers_only,
      sort: input.sort,
    };
    const [rows, counts] = await Promise.all([
      loadInboxConversations(ctx.db, tenantId, { tab: input.tab, filters, now }),
      countInboxTabs(ctx.db, tenantId),
    ]);
    const { page, next_cursor } = pageOf(rows, input.cursor);
    const fresh = await newCountsFor(
      ctx,
      tenantId,
      page.map((r) => r.groupKey),
    );
    return {
      items: page.map((e) => ({
        item_id: e.itemId,
        kind: e.kind,
        platform: e.platform,
        status: e.status,
        category: e.category,
        received_at: e.receivedAt,
        customer_name: e.authorName,
        customer_text: clip(e.text, TEXT_PREVIEW),
        draft: e.draft
          ? { draft_id: e.draft.id, status: e.draft.status, needs_owner_input: e.draft.needsHuman }
          : null,
        group: input.tab === "for_you" ? e.group : null,
        messages: e.messages,
        waiting: e.waiting,
        new_messages: fresh.get(e.groupKey) ?? e.newMessages,
        threads: e.threads,
        posts: e.posts,
        dm_window_closes_at: e.dmWindowClosesAt,
      })),
      counts,
      next_cursor,
    };
  },
});

export const getConversation = defineTool({
  name: "get_conversation",
  title: "Open a message",
  description: `One message in full, with all of the sender's messages in the thread (their DMs, an email sender across threads, a commenter across posts) and the business's replies, Waggle's draft reply (if any) with the business-info facts it used, why it came to the owner, and which actions fit now. Waggle's drafts only use the business's saved facts; if you write a reply yourself, use search_knowledge for facts and never invent prices, availability or promises. ${UNTRUSTED}`,
  access: "read",
  annotations: READ,
  wraps: "approvals.loadEntries, approvals.heldReason, approvals.loadConversation",
  input: z.object({ brand_id: brandId, item_id: itemId }),
  output: z.object({
    item_id: z.uuid(),
    kind: z.enum(["comment", "dm", "review", "call"]),
    platform: z.string(),
    status: z.string(),
    category: z.string().nullable(),
    received_at: z.string(),
    customer_name: z.string().nullable(),
    customer_text: z.string(),
    review_recommends: z.boolean().nullable(),
    permalink: z.string().nullable(),
    thread: z
      .array(
        z.object({
          from: z.enum(["customer", "business"]),
          customer_text: z.string().optional(),
          business_text: z.string().optional(),
          item_id: z.uuid().describe("The customer message it belongs to."),
          at: z.string(),
          subject: z.string().nullable().optional().describe("Email: the thread's subject."),
        }),
      )
      .describe("The sender's messages and the replies sent, oldest first (the latest 50)."),
    held_reason: z.string().nullable(),
    draft: z
      .object({
        draft_id: z.uuid(),
        body: z.string(),
        status: z.string(),
        reply_via: z.enum(["public", "dm"]),
        facts_used: z.array(z.string()),
        needs_owner_input: z.boolean(),
        why: z.string().nullable(),
      })
      .nullable(),
    can: z.object({
      approve_reply: z.boolean(),
      write_reply: z.boolean(),
      reply_in_dm_until: z.string().nullable(),
      dm_window_closes_at: z.string().nullable(),
    }),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const [entry] = await loadEntries(ctx.db, tenantId, { itemIds: [input.item_id] });
    if (!entry) throw new ToolError("not_found", "No such message for this brand.");
    const [conversation, held] = await Promise.all([
      loadConversation(ctx.db, tenantId, entry.itemId),
      NEEDS_OWNER.includes(entry.status as (typeof NEEDS_OWNER)[number])
        ? heldReason(ctx.db, entry.itemId, entry.status)
        : Promise.resolve(null),
    ]);
    const d = entry.draft;
    const dmUntil =
      entry.kind === "comment" ? privateReplyClosesAt(entry.receivedAt).toISOString() : null;
    return {
      item_id: entry.itemId,
      kind: entry.kind,
      platform: entry.platform,
      status: entry.status,
      category: entry.category,
      received_at: entry.receivedAt,
      customer_name: entry.authorName,
      customer_text: entry.text,
      review_recommends: entry.reviewRecommends,
      permalink: entry.permalink,
      thread: (conversation?.thread ?? []).map((m) =>
        m.from === "customer"
          ? {
              from: "customer" as const,
              customer_text: m.text,
              item_id: m.itemId,
              at: m.at,
              subject: m.subject ?? null,
            }
          : { from: "business" as const, business_text: m.text, item_id: m.itemId, at: m.at },
      ),
      held_reason: held,
      draft: d
        ? {
            draft_id: d.id,
            body: d.editedBody ?? d.body,
            status: d.status,
            reply_via: d.replyVia,
            facts_used: d.facts,
            needs_owner_input: d.needsHuman,
            why: d.needsHumanReason,
          }
        : null,
      can: {
        approve_reply: entry.status === "awaiting_approval" && d?.status === "pending",
        write_reply: entry.status === "awaiting_approval" || entry.status === "escalated",
        reply_in_dm_until: dmUntil,
        dm_window_closes_at: entry.dmWindowClosesAt,
      },
    };
  },
});

const sendingOutput = z.object({
  status: z.literal("sending"),
  draft_id: z.uuid(),
  undo_until: z.string().describe("undo_reply works until this time (about 8 seconds)."),
});

export const approveReply = defineTool({
  name: "approve_reply",
  title: "Approve a reply",
  description:
    "Sends Waggle's draft reply, or the owner's edited wording, to the customer on Instagram or Facebook. Use after get_conversation, only when the user has said to send it. Waggle's rules are checked again at send time. The reply can be stopped with undo_reply for about 8 seconds.",
  access: "act",
  ability: "replies.approve",
  annotations: PUBLIC_ACTION,
  wraps: "approvals.approveDraft",
  input: z.object({
    brand_id: brandId,
    item_id: itemId,
    draft_id: z.uuid().describe("draft.draft_id from get_conversation."),
    edited_body: z.string().max(REPLY_MAX).optional().describe("The owner's wording instead."),
    reply_via: replyVia,
  }),
  output: sendingOutput,
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await approveDraft(ctx.db, {
      tenantId,
      userId: ctx.principal.userId,
      itemId: input.item_id,
      draftId: input.draft_id,
      editedBody: input.edited_body ?? null,
      replyVia: input.reply_via,
    });
    if (!r.ok) return decided(r.error);
    return { status: "sending" as const, draft_id: input.draft_id, undo_until: undoUntil(ctx) };
  },
});

export const writeReply = defineTool({
  name: "write_reply",
  title: "Send the owner's own reply",
  description:
    "Sends a reply in the owner's own words: to a message waiting for approval (instead of Waggle's draft) or to one Waggle handed to the owner (a complaint, an unclear message). Only use wording the user approved. Use facts from search_knowledge; never invent prices, availability or promises. DMs can only be answered within 24 hours of the customer's last message. Can be stopped with undo_reply for about 8 seconds.",
  access: "act",
  ability: "replies.approve",
  annotations: PUBLIC_ACTION,
  wraps: "approvals.writeOwnerReply",
  input: z.object({
    brand_id: brandId,
    item_id: itemId,
    body: z.string().min(1).max(REPLY_MAX),
    reply_via: replyVia,
  }),
  output: sendingOutput,
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await writeOwnerReply(ctx.db, {
      tenantId,
      userId: ctx.principal.userId,
      itemId: input.item_id,
      body: input.body,
      replyVia: input.reply_via,
      via: viaOf(ctx.principal),
    });
    if (!r.ok) return decided(r.error);
    return { status: "sending" as const, draft_id: r.draftId, undo_until: undoUntil(ctx) };
  },
});

export const undoReply = defineTool({
  name: "undo_reply",
  title: "Undo a reply",
  description:
    "Stops a reply from approve_reply or write_reply if it hasn't started going out (about 8 seconds). The message goes back to waiting for approval.",
  access: "act",
  ability: "replies.approve",
  annotations: LOCAL_ACTION,
  wraps: "approvals.undoApproval",
  input: z.object({ brand_id: brandId, item_id: itemId, draft_id: z.uuid() }),
  output: z.object({ undone: z.literal(true) }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await undoApproval(ctx.db, {
      tenantId,
      userId: ctx.principal.userId,
      itemId: input.item_id,
      draftId: input.draft_id,
      now: ctx.now?.(),
    });
    if (!r.ok) {
      if (r.error === "not_found") return decided(r.error);
      throw new ToolError("already_decided", "Too late to undo: the reply is already going out.");
    }
    return { undone: true as const };
  },
});

export const resolveItem = defineTool({
  name: "resolve_item",
  title: "Resolve a message without replying",
  description:
    "Closes a message without sending anything. reject_draft: don't send Waggle's draft (message waiting for approval). mark_handled: the owner dealt with it outside Waggle (a handed-over or failed message). not_spam: Waggle wrongly marked it spam; it stays in For you to be answered.",
  access: "act",
  ability: "replies.approve",
  annotations: LOCAL_ACTION,
  wraps: "approvals.rejectDraft, approvals.markHandled, approvals.markNotSpam",
  input: z.object({
    brand_id: brandId,
    item_id: itemId,
    action: z.enum(["reject_draft", "mark_handled", "not_spam"]),
  }),
  output: z.object({ done: z.literal(true) }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const base = { tenantId, userId: ctx.principal.userId, itemId: input.item_id };
    let r;
    if (input.action === "reject_draft") {
      const [entry] = await loadEntries(ctx.db, tenantId, { itemIds: [input.item_id] });
      if (!entry?.draft) return decided("not_found");
      r = await rejectDraft(ctx.db, { ...base, draftId: entry.draft.id });
    } else if (input.action === "mark_handled") {
      r = await markHandled(ctx.db, base);
    } else {
      r = await markNotSpam(ctx.db, base);
    }
    if (!r.ok) return decided(r.error);
    return { done: true as const };
  },
});

export const hideComment = defineTool({
  name: "hide_comment",
  title: "Hide or unhide a comment",
  description:
    "Hides a comment on its Instagram or Facebook post (hidden: true), for spam or abuse, or shows it again (hidden: false). Comments only. Hidden comments stay visible to the commenter and their friends, as Meta does it.",
  access: "act",
  ability: "replies.approve",
  annotations: PUBLIC_ACTION,
  wraps: "approvals.hideSpamComment, approvals.unhideComment",
  input: z.object({ brand_id: brandId, item_id: itemId, hidden: z.boolean() }),
  output: z.object({ outcome: z.enum(["hidden", "gone", "visible"]) }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const deps = { db: ctx.db, social: ctx.social() };
    const base = { tenantId, userId: ctx.principal.userId, itemId: input.item_id };
    if (input.hidden) {
      const r = await hideSpamComment(deps, base);
      if (r.ok) return { outcome: r.outcome };
      if (r.error === "hide_failed") {
        throw new ToolError("provider_failed", "Instagram/Facebook didn't hide it. Try again.");
      }
      return decided(r.error);
    }
    const r = await unhideComment(deps, base);
    if (r.ok) return { outcome: "visible" as const };
    if (r.error === "unhide_failed") {
      throw new ToolError("provider_failed", "Instagram/Facebook didn't unhide it. Try again.");
    }
    return decided(r.error);
  },
});

export const INBOX_TOOLS = [
  listBrands,
  listInbox,
  getConversation,
  approveReply,
  writeReply,
  undoReply,
  resolveItem,
  hideComment,
];
