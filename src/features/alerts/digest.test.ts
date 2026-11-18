import { describe, expect, it } from "vitest";
import { composeDigest, digestDue, digestLine, groupByPerson, IMMEDIATE_KINDS } from "./digest";

const ctx = { businessName: "Harbour Bean", appUrl: "https://app.test" };
const esc = (itemId: string, authorName: string, platform = "instagram") =>
  digestLine(
    {
      kind: "escalation",
      itemId,
      itemKind: "dm",
      platform,
      authorName,
      category: null,
      status: "escalated",
      reason: "complaint",
    },
    ctx.appUrl,
  )!;

describe("digestDue", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  it("waits the full interval from the oldest entry", () => {
    expect(digestDue(new Date("2026-11-18T09:01:00Z"), "hourly", now)).toBe(false);
    expect(digestDue(new Date("2026-11-18T09:00:00Z"), "hourly", now)).toBe(true);
    expect(digestDue(new Date("2026-11-18T08:30:00Z"), "two_hours", now)).toBe(false);
    expect(digestDue(new Date("2026-11-18T08:00:00Z"), "two_hours", now)).toBe(true);
    expect(digestDue(now, "now", now)).toBe(true);
  });
});

describe("summaries", () => {
  it("lost connections and RCS news never wait", () => {
    expect(IMMEDIATE_KINDS.has("disconnect")).toBe(true);
    expect(IMMEDIATE_KINDS.has("rcs_status")).toBe(true);
    expect(IMMEDIATE_KINDS.has("escalation")).toBe(false);
  });

  it("one block per person, however many messages they sent", () => {
    const blocks = groupByPerson([
      esc("1", "Ana Cruz"),
      esc("2", "ana cruz"),
      esc("3", "Ana Cruz", "facebook"),
      esc("4", "Ben Ortiz"),
    ]);
    expect(blocks.map((b) => b.person)).toEqual(["Ana Cruz", "Ben Ortiz"]);
    expect(blocks[0].places).toEqual(["Instagram DM", "Facebook DM"]);
    expect(blocks[0].lines).toHaveLength(3);
    expect(blocks[0].href).toBe("https://app.test/inbox/items/3");
  });

  it("the email: who, where, why and links; never message text", () => {
    const email = composeDigest(
      [
        esc("1", "Ana Cruz"),
        esc("2", "Ana Cruz"),
        digestLine({ kind: "draft_waiting", count: 2 }, ctx.appUrl)!,
        esc("3", "<b>Ben</b>", "google"),
      ],
      ctx,
    );
    expect(email.subject).toBe("Harbour Bean: 2 people need you");
    expect(email.text).toContain("Ana Cruz (Instagram DM)");
    expect(email.text).toContain("2× It looks like a complaint.");
    expect(email.text).toContain("2 replies are waiting for your OK");
    expect(email.text).toContain("https://app.test/settings/notifications");
    expect(email.html).toContain("waggle<span");
    expect(email.html).toContain("&lt;b&gt;Ben&lt;/b&gt;");
    expect(email.html).toContain("email");
  });

  it("lost connections have no summary line", () => {
    expect(
      digestLine({ kind: "disconnect", platform: "instagram", username: "x" }, ctx.appUrl),
    ).toBeNull();
  });
});
