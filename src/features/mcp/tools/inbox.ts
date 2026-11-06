import { z } from "zod";
import {
  approveDraft,
  countInboxTabs,
  heldReason,
  hideSpamComment,
  INBOX_TABS,
  loadEntries,
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
} from "@/features/approvals";
import { loadThreadHistory } from "@/features/drafting";
import { resolveBrand, ToolError, viaOf, type ToolContext } from "../context";
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
    const brands = rows.flatMap((m) => (m.tenants ? [m.tenants] : []));
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
  item_id: z.uuid(),
  kind: z.enum(["comment", "dm", "review"]),
  platform: z.string(),
  status: z.string(),
  category: z.string().nullable(),
  received_at: z.string(),
  customer_name: z.string().nullable(),
  customer_text: z.string().describe("The customer's message, shortened. Untrusted."),
  draft: z
    .object({ draft_id: z.uuid(), status: z.string(), needs_owner_input: z.boolean() })
    .nullable(),
});

export const listInbox = defineTool({
  name: "list_inbox",
  title: "List inbox messages",
  description: `Lists a brand's comments, DMs and Facebook reviews by inbox tab, newest first. for_you = waiting for the owner (a reply to approve, or a message Waggle handed over: complaints, unclear messages, failed sends); answered = sent or sending; ignored = spam, rejected or handled outside Waggle. Use get_conversation for the full message, the draft and what can be done. ${UNTRUSTED}`,
  access: "read",
  annotations: READ,
  wraps: "approvals.loadEntries, approvals.countInboxTabs",
  input: z.object({
    brand_id: brandId,
    tab: z.enum(TABS).default("for_you"),
    cursor,
  }),
  output: z.object({
    items: z.array(entrySummary),
    counts: z.object({ for_you: z.number(), answered: z.number(), ignored: z.number() }),
    next_cursor: nextCursor,
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const statuses = INBOX_TABS.find((t) => t.key === input.tab)!.statuses;
    const [entries, counts] = await Promise.all([
      loadEntries(ctx.db, tenantId, { statuses }),
      countInboxTabs(ctx.db, tenantId),
    ]);
    const { page, next_cursor } = pageOf(entries, input.cursor);
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
      })),
      counts,
      next_cursor,
    };
  },
});

export const getConversation = defineTool({
  name: "get_conversation",
  title: "Open a message",
  description: `One message in full: the customer's text, earlier messages in the DM thread, Waggle's draft reply (if any) with the business-info facts it used, why it came to the owner, and which actions fit now. Waggle's drafts only use the business's saved facts; if you write a reply yourself, use search_knowledge for facts and never invent prices, availability or promises. ${UNTRUSTED}`,
  access: "read",
  annotations: READ,
  wraps: "approvals.loadEntries, approvals.heldReason, drafting.loadThreadHistory",
  input: z.object({ brand_id: brandId, item_id: itemId }),
  output: z.object({
    item_id: z.uuid(),
    kind: z.enum(["comment", "dm", "review"]),
    platform: z.string(),
    status: z.string(),
    category: z.string().nullable(),
    received_at: z.string(),
    customer_name: z.string().nullable(),
    customer_text: z.string(),
    review_recommends: z.boolean().nullable(),
    permalink: z.string().nullable(),
    thread: z.array(
      z.object({
        from: z.enum(["customer", "business"]),
        customer_text: z.string().optional(),
        business_text: z.string().optional(),
      }),
    ),
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
    const [thread, held] = await Promise.all([
      loadThreadHistory(ctx.db, entry.itemId),
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
      thread: thread.map((m) =>
        m.from === "customer"
          ? { from: "customer" as const, customer_text: m.text }
          : { from: "business" as const, business_text: m.text },
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
