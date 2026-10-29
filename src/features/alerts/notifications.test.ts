import { describe, expect, it } from "vitest";
import { describeNotification, type Lookups, type NotificationRow } from "./notifications";

const lookups: Lookups = {
  items: new Map([
    ["i1", { author: "jen.dc", kind: "comment", category: "complaint", status: "escalated" }],
    ["i2", { author: "Carlo", kind: "dm", category: "lead", status: "awaiting_approval" }],
  ]),
  accounts: new Map([["a1", { platform: "instagram", username: "harbourbean" }]]),
  posts: new Map([["p1", { content: "Ube cheese pandesal is back!", lastError: null }]]),
  leads: new Map([["l1", { name: "Carlo", request: "Table for 8, Saturday 7pm" }]]),
};
const row = (over: Partial<NotificationRow>): NotificationRow => ({
  id: "n1",
  kind: "lead",
  needs_action: true,
  item_id: null,
  social_account_id: null,
  post_id: null,
  details: {},
  read_at: null,
  updated_at: "2026-10-29T10:00:00Z",
  ...over,
});

describe("describeNotification", () => {
  it("lead: coral, the lead's name and request, links to the conversation", () => {
    expect(
      describeNotification(
        row({ kind: "lead", item_id: "i2", details: { leadId: "l1" } }),
        lookups,
      ),
    ).toMatchObject({
      tone: "lead",
      title: "New lead: Carlo",
      meta: "Table for 8, Saturday 7pm",
      href: "/inbox/items/i2",
      unread: true,
    });
  });

  it("needs you: amber, who and why", () => {
    expect(describeNotification(row({ kind: "needs_you", item_id: "i1" }), lookups)).toMatchObject({
      tone: "attention",
      title: "jen.dc needs you",
      meta: "It looks like a complaint.",
      action: "Review",
    });
  });

  it("account, waiting replies, posts and auto-sent batches", () => {
    expect(
      describeNotification(row({ kind: "account", social_account_id: "a1" }), lookups),
    ).toMatchObject({
      title: "Instagram @harbourbean disconnected",
      action: "Reconnect",
      href: "/settings",
    });
    expect(
      describeNotification(
        row({ kind: "replies_waiting", details: { draftIds: ["a", "b"] } }),
        lookups,
      ).title,
    ).toBe("2 replies are waiting for you");
    expect(
      describeNotification(
        row({ kind: "post_published", post_id: "p1", needs_action: false }),
        lookups,
      ),
    ).toMatchObject({
      tone: "post",
      title: "Your post is live",
      meta: "Ube cheese pandesal is back!",
    });
    expect(
      describeNotification(
        row({ kind: "post_failed", post_id: "p1", details: { failureReason: "zernio_paused" } }),
        lookups,
      ),
    ).toMatchObject({ title: "A post needs a new time", action: "Reschedule" });
    expect(
      describeNotification(
        row({ kind: "auto_sent", needs_action: false, details: { count: 5 }, read_at: "x" }),
        lookups,
      ),
    ).toMatchObject({ tone: "success", title: "5 replies sent automatically", unread: false });
  });

  it("never says webhook, LLM or classifier", () => {
    const all = (
      [
        "lead",
        "needs_you",
        "account",
        "replies_waiting",
        "post_published",
        "post_failed",
        "auto_sent",
      ] as const
    )
      .map((kind) => {
        const n = describeNotification(row({ kind }), lookups);
        return `${n.title} ${n.meta}`;
      })
      .join(" ");
    expect(all).not.toMatch(/webhook|llm|classifier|zernio/i);
  });
});
