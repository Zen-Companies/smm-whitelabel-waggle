import { describe, expect, it } from "vitest";
import { historyLimit, interleave, isUnanswered } from "./history";
import {
  DRAFT_PROMPT_VERSION,
  DRAFT_PROMPTS,
  REPLY_LANGUAGE_RULE,
  THREAD_HISTORY_LIMIT,
  THREAD_HISTORY_MAX,
} from "./prompts";

describe("draft prompt 2026-11-26.1 (one reply per conversation)", () => {
  const p = DRAFT_PROMPTS["2026-11-26.1"];
  const base = {
    kind: "dm" as const,
    category: "lead",
    text: "And how much would that be?",
    facts: [{ id: "k1", title: "Prices", content: "Ube pandesal $14 a dozen" }],
    platform: "instagram",
  };

  it("is the current version", () => {
    expect(DRAFT_PROMPT_VERSION).toBe("2026-11-26.1");
  });

  it("answers the waiting earlier messages in the same reply, facts still only from BUSINESS INFO", () => {
    const system = p.system("Harbour Bakery");
    expect(system).toMatch(/marked \(not answered yet\)[\s\S]*answer them in the same reply/);
    expect(system).not.toContain("reply only to the latest message");
    expect(system).toMatch(/Facts still come only from BUSINESS INFO/);
    // Everything else of 2026-11-20.1 stays.
    expect(system).toContain(REPLY_LANGUAGE_RULE);
    expect(system).toMatch(/9\. CALENDAR/);
  });

  it("marks the waiting messages among the earlier ones", () => {
    const user = p.user({
      ...base,
      history: [
        { from: "customer", text: "Are you open Saturday?" },
        { from: "business", text: "Yes, 7 AM to 2 PM." },
        { from: "customer", text: "Can I order 2 dozen ube pandesal?", waiting: true },
        { from: "customer", text: "Pick up around 9", waiting: true },
      ],
    });
    expect(user).toContain("EARLIER MESSAGES (oldest first):");
    expect(user).toContain("Customer: Are you open Saturday?");
    expect(user).toContain("You: Yes, 7 AM to 2 PM.");
    expect(user).toContain("Customer (not answered yet): Can I order 2 dozen ube pandesal?");
    expect(user).toContain("Customer (not answered yet): Pick up around 9");
    expect(user).toContain("Channel: direct message on Instagram");
    expect(p.user(base)).not.toContain("EARLIER MESSAGES");
  });
});

describe("history for one reply", () => {
  it("keeps the waiting flag through interleave", () => {
    expect(
      interleave(
        [
          { text: "first", receivedAt: "2026-11-25T10:00:00Z" },
          { text: "second", receivedAt: "2026-11-25T10:05:00Z", waiting: true },
        ],
        [{ text: "reply", sentAt: "2026-11-25T10:01:00Z" }],
      ),
    ).toEqual([
      { from: "customer", text: "first" },
      { from: "business", text: "reply" },
      { from: "customer", text: "second", waiting: true },
    ]);
  });

  it("sends more history only to reach the oldest waiting message", () => {
    const w = (waiting: boolean) => ({ waiting });
    expect(historyLimit([w(false), w(false)])).toBe(THREAD_HISTORY_LIMIT);
    expect(historyLimit([w(true), w(true), w(true), w(true), w(true), w(true)])).toBe(6);
    expect(historyLimit(Array.from({ length: 12 }, () => w(true)))).toBe(THREAD_HISTORY_MAX);
  });

  it("knows which customer messages are still unanswered", () => {
    expect(isUnanswered("awaiting_approval")).toBe(true);
    expect(isUnanswered("awaiting_draft")).toBe(true);
    expect(isUnanswered("escalated")).toBe(true);
    expect(isUnanswered("sent")).toBe(false);
    expect(isUnanswered("handled")).toBe(false);
  });
});
