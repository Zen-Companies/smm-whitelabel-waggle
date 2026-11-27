import { describe, expect, it } from "vitest";
import { ToolError, type ToolContext } from "../context";
import { listInbox, newSinceRead } from "./inbox";

describe("newSinceRead: 'N new' for rows this login opened in Waggle", () => {
  it("counts messages after the last open, never ignored ones, per row", () => {
    const reads = [
      { group_key: "s:a:1", seen_at: "2026-11-26T10:00:00Z" },
      { group_key: "s:a:2", seen_at: "2026-11-26T12:00:00Z" },
    ];
    const items = [
      { group_key: "s:a:1", received_at: "2026-11-26T09:00:00Z", status: "sent" },
      { group_key: "s:a:1", received_at: "2026-11-26T11:00:00Z", status: "awaiting_approval" },
      { group_key: "s:a:1", received_at: "2026-11-26T11:30:00Z", status: "ignored" },
      { group_key: "s:a:2", received_at: "2026-11-26T11:00:00Z", status: "escalated" },
      { group_key: "s:a:3", received_at: "2026-11-26T13:00:00Z", status: "escalated" },
    ];
    const out = newSinceRead(reads, items);
    expect(out.get("s:a:1")).toBe(1);
    expect(out.get("s:a:2")).toBe(0);
    // Never opened: not counted here (the database's count, the ones waiting, stays).
    expect(out.has("s:a:3")).toBe(false);
  });
});

describe("list_inbox filters", () => {
  const ctx = {} as ToolContext;
  const refused = async (raw: unknown) => {
    const e = await listInbox.run(ctx, raw).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ToolError);
    expect((e as ToolError).code).toBe("invalid_input");
  };

  it("takes the app's filters and sorts only", async () => {
    await refused({ type: ["sms"] });
    await refused({ status: ["unread"] });
    await refused({ sort: "oldest" });
    await refused({ platform: ["Instagram!"] });
  });

  it("defaults: For you, customers only, by priority", () => {
    expect(listInbox.input.parse({})).toMatchObject({
      tab: "for_you",
      customers_only: true,
      sort: "priority",
    });
  });
});
