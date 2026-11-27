import { describe, expect, it } from "vitest";
import { carryOnPlan, FOLLOW_UPS_HREF, INVITE_HREF } from "./carry-on";
import { popupVersion } from "./popup-copy";
import type { OfferReason } from "./upgrade";

const plan = (
  reason: OfferReason | "welcome",
  params: Parameters<typeof popupVersion>[1] = {},
  opts: { connected?: string[]; canConnect?: boolean } = {},
  replies: "out" | "low" = "out",
) =>
  carryOnPlan(popupVersion(reason, params, replies), {
    connected: opts.connected,
    canConnect: opts.canConnect ?? true,
  });

describe("carryOnPlan (the 14-row table)", () => {
  it("A, platform known: that platform's sign-in starts", () => {
    expect(plan("accounts", { platform: "tiktok" })).toEqual({
      step: { kind: "connect", platform: "tiktok" },
      doing: "Opening TikTok…",
      why: "So you can finish connecting it.",
    });
    expect(plan("extra_account", { platform: "facebook" }).step).toEqual({
      kind: "connect",
      platform: "facebook",
    });
  });

  it("A, no platform (or no connect on the page): the connect list", () => {
    expect(plan("accounts").step).toEqual({ kind: "go", href: "/settings/accounts" });
    expect(plan("accounts", { platform: "tiktok" }, { canConnect: false }).step).toEqual({
      kind: "go",
      href: "/settings/accounts",
    });
  });

  it("A, setup's multi-pick: the first chosen one not connected yet", () => {
    expect(plan("accounts", { platforms: "instagram,tiktok" }).step).toEqual({
      kind: "connect",
      platform: "instagram",
    });
    expect(
      plan("accounts", { platforms: "instagram,tiktok" }, { connected: ["instagram"] }).step,
    ).toEqual({ kind: "connect", platform: "tiktok" });
  });

  it("B, one kind: that kind switched on, then How Waggle replies", () => {
    expect(plan("auto_reply", { topic: "lead" })).toEqual({
      step: { kind: "worker_bee", topic: "lead", href: "/teach?replies=1&on=lead" },
      doing: "Turning on Worker Bee for leads…",
      why: "Then you’ll see it in How Waggle replies.",
    });
  });

  it("B, general: the regular questions", () => {
    expect(plan("auto_reply").step).toEqual({
      kind: "worker_bee",
      topic: "faq",
      href: "/teach?replies=1&on=faq",
    });
    expect(plan("auto_reply").doing).toBe("Turning on Worker Bee for questions…");
  });

  it("C, out of replies: replies for the messages that waited", () => {
    expect(plan("out").step).toEqual({ kind: "write_replies" });
    expect(plan("replies", {}, {}, "out").step).toEqual({ kind: "write_replies" });
  });

  it("C, running low: back on the page", () => {
    expect(plan("replies", {}, {}, "low").step).toEqual({ kind: "stay" });
    expect(plan("top_up", {}, {}, "low").step).toEqual({ kind: "stay" });
  });

  it("D, reconnect: that platform's sign-in, or the connect list", () => {
    expect(plan("idle", { platform: "instagram" })).toEqual({
      step: { kind: "connect", platform: "instagram" },
      doing: "Opening Instagram…",
      why: "So you can reconnect it.",
    });
    expect(plan("idle").step).toEqual({ kind: "go", href: "/settings/accounts" });
  });

  it("E: invite form, new business, follow-ups, leads", () => {
    expect(plan("team").step).toEqual({ kind: "go", href: INVITE_HREF });
    expect(plan("brands").step).toEqual({ kind: "go", href: "/brands/new" });
    expect(plan("follow_ups").step).toEqual({ kind: "go", href: FOLLOW_UPS_HREF });
    expect(plan("leads").step).toEqual({ kind: "go", href: "/contacts/leads" });
  });

  it("F, Try Solo banner and welcome: the Inbox", () => {
    expect(plan("nudge").step).toEqual({ kind: "go", href: "/inbox" });
    expect(plan("welcome").step).toEqual({ kind: "go", href: "/inbox" });
  });

  it("every step says what happens next", () => {
    const reasons: (OfferReason | "welcome")[] = [
      "accounts",
      "extra_account",
      "auto_reply",
      "out",
      "replies",
      "top_up",
      "idle",
      "team",
      "brands",
      "follow_ups",
      "leads",
      "nudge",
      "welcome",
    ];
    for (const r of reasons) {
      const p = plan(r);
      expect(p.doing).toMatch(/…$/);
      expect(p.why.length).toBeGreaterThan(5);
    }
  });
});
