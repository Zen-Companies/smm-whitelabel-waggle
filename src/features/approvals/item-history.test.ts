import { describe, expect, it } from "vitest";
import { historyLine } from "./item-history";

const you = () => "You";

describe("historyLine", () => {
  it("tells the story of a reply in plain words", () => {
    expect(historyLine("item_received", {}, you)).toBe("Message received");
    expect(historyLine("draft_created", { needsHuman: false }, you)).toBe(
      "Reply drafted from your business info",
    );
    expect(historyLine("draft_approved", {}, you)).toBe("You approved the reply");
    expect(historyLine("status_changed", { to: "sending", decidedBy: "u1" }, you)).toBe(
      "You moved it to sending",
    );
    expect(
      historyLine("status_changed", { to: "escalated", policyReason: "dm_window_closed" }, you),
    ).toBe("Moved to handed to you (dm window closed)");
    expect(historyLine("reply_sent", {}, you)).toBe("Reply sent");
  });

  it("never says classifier, LLM or webhook", () => {
    const text = ["classifier_fallback", "draft_created", "alert_sent"]
      .map((a) => historyLine(a, {}, you))
      .join(" ");
    expect(text).not.toMatch(/classifier|llm|webhook/i);
  });
});
