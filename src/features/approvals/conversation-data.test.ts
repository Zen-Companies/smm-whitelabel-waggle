import { describe, expect, it } from "vitest";
import { activityLines, tabForStatus } from "./conversation-data";

const row = (
  action: string,
  details: Record<string, unknown> = {},
  at = "2026-10-29T10:00:00Z",
) => ({
  action,
  created_at: at,
  details,
});

describe("activityLines", () => {
  it("tells what happened in plain words, without the machinery", () => {
    const lines = activityLines(
      [
        row("item_received"),
        row("status_changed", { to: "classified", category: "lead", confidence: 0.94 }),
        row("draft_created", { needsHuman: false, promptVersion: "x" }),
        row("lead_captured"),
        row("status_changed", { to: "drafted" }),
        row("status_changed", { to: "awaiting_approval", policyReason: "approval_required" }),
      ],
      { category: "lead", factTitles: ["Reservations"] },
    ).map((l) => l.text);
    expect(lines).toEqual([
      "Message received",
      "Recognized as a lead",
      "Reply written from Reservations",
      "Saved to Leads",
      "Waiting for your OK",
    ]);
  });

  it("explains why something came to the owner, and the send outcome", () => {
    expect(
      activityLines(
        [
          row("draft_approved"),
          row("status_changed", { to: "sending" }),
          row("status_changed", { to: "escalated", policyReason: "dm_window_closed" }),
        ],
        { category: "faq", factTitles: [] },
      ).map((l) => l.text),
    ).toEqual(["Approved by you", "Handed to you: reply window closed"]);
  });

  it("never mentions models, tokens, costs or internal names", () => {
    const text = activityLines(
      [
        row("classifier_fallback", { model: "gpt" }),
        row("alert_sent", { mode: "logged" }),
        row("status_changed", { to: "classified" }),
      ],
      { category: "faq", factTitles: [] },
    )
      .map((l) => l.text)
      .join(" ");
    expect(text).toBe("Recognized as a question");
    expect(text).not.toMatch(/jev|model|token|cost|\$/i);
  });
});

describe("tabForStatus", () => {
  it("sends links to the tab that lists the item", () => {
    expect(tabForStatus("awaiting_approval")).toBe("waiting");
    expect(tabForStatus("escalated")).toBe("needs");
    expect(tabForStatus("failed")).toBe("needs");
    expect(tabForStatus("sent")).toBe("sent");
    expect(tabForStatus("handled")).toBe("sent");
  });
});
