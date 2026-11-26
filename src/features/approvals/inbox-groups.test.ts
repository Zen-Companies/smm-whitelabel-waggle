import { describe, expect, it } from "vitest";
import { newLineIndex } from "./conversation-pane";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filterParams,
  inboxType,
  orderConversations,
  parseInboxFilters,
  priorityGroup,
  rowCountLabel,
  toggleFilter,
  windowLeft,
} from "./inbox-groups";

const now = new Date("2026-11-26T09:45:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

describe("filters in the address (Inbox by sender, 26 Nov)", () => {
  it("defaults: nothing on, From customers only, by priority", () => {
    expect(parseInboxFilters({})).toEqual(DEFAULT_FILTERS);
    expect(filterParams(DEFAULT_FILTERS)).toEqual({});
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it("reads ?platform=google&status=failed (the board's link), ignoring unknown values", () => {
    const f = parseInboxFilters({
      platform: "google",
      status: "failed,nonsense",
      type: "email,dm,carrier-pigeon",
      sort: "newest",
      customers: "all",
    });
    expect(f).toEqual({
      platforms: ["google"],
      types: ["email", "dm"],
      flags: ["failed"],
      customersOnly: false,
      sort: "newest",
    });
    expect(activeFilterCount(f)).toBe(5);
    expect(parseInboxFilters(filterParams(f))).toEqual(f);
  });

  it("drops odd platform values and repeats", () => {
    expect(parseInboxFilters({ platform: "google,google,<script>,Instagram" }).platforms).toEqual(
      ["google", "instagram"],
    );
    expect(parseInboxFilters({ platform: ["google", "facebook"] }).platforms).toEqual([
      "google",
      "facebook",
    ]);
  });

  it("switches one chip on and off", () => {
    const on = toggleFilter(DEFAULT_FILTERS, "flags", "leads");
    expect(on.flags).toEqual(["leads"]);
    expect(toggleFilter(on, "flags", "leads").flags).toEqual([]);
  });

  it("names email as its own type", () => {
    expect(inboxType("dm", true)).toBe("email");
    expect(inboxType("dm", false)).toBe("dm");
    expect(inboxType("review", false)).toBe("review");
    expect(inboxType("call", false)).toBe("call");
  });
});

describe("what needs you on top", () => {
  it("rank 1 (complaints, leads, couldn't be sent) needs you now", () => {
    expect(priorityGroup({ rank: 1, dmWindowClosesAt: null }, now)).toBe("now");
  });

  it("a DM whose window closes within 3 hours moves up", () => {
    expect(priorityGroup({ rank: 2, dmWindowClosesAt: hours(2) }, now)).toBe("now");
    expect(priorityGroup({ rank: 3, dmWindowClosesAt: hours(2.99) }, now)).toBe("now");
    expect(priorityGroup({ rank: 2, dmWindowClosesAt: hours(23) }, now)).toBe("ready");
    // Already closed: nothing left to save by hurrying.
    expect(priorityGroup({ rank: 3, dmWindowClosesAt: hours(-1) }, now)).toBe("also");
  });

  const row = (groupKey: string, rank: number, latestAt: string, window: string | null = null) => ({
    groupKey,
    rank,
    latestAt,
    dmWindowClosesAt: window,
  });

  it("orders Needs you now, Ready to approve, Also for you, newest first in each", () => {
    const rows = [
      row("carla", 3, "2026-11-26T08:02:00Z"),
      row("walter", 2, "2026-11-26T09:41:00Z", hours(23)),
      row("lena", 1, "2026-11-26T09:52:00Z"),
      row("jess", 2, "2026-11-26T09:20:00Z"),
      row("maya", 2, "2026-11-25T11:40:00Z", hours(2)),
    ];
    const ordered = orderConversations(rows, "priority", now);
    expect(ordered.map((r) => r.groupKey)).toEqual(["lena", "maya", "walter", "jess", "carla"]);
    expect(ordered.map((r) => r.group)).toEqual(["now", "now", "ready", "ready", "also"]);
  });

  it("Walter's DM lands at the top of its group, not at row 100 (the reverse bug)", () => {
    const newsletters = Array.from({ length: 99 }, (_, i) =>
      row(`n${i}`, 3, new Date(Date.parse("2026-11-12T00:00:00Z") + i * 60_000).toISOString()),
    );
    const walter = row("walter", 2, "2026-11-26T09:41:00Z", hours(23));
    expect(orderConversations([...newsletters, walter], "priority", now)[0].groupKey).toBe(
      "walter",
    );
    expect(orderConversations([...newsletters, walter], "newest", now)[0].groupKey).toBe("walter");
  });

  it("Newest drops the groups", () => {
    const rows = [row("old", 1, "2026-11-20T00:00:00Z"), row("new", 3, "2026-11-26T00:00:00Z")];
    expect(orderConversations(rows, "newest", now).map((r) => r.groupKey)).toEqual([
      "new",
      "old",
    ]);
  });
});

describe("row details", () => {
  it("time left in the DM window", () => {
    expect(windowLeft(hours(23.5), now)).toBe("23 h left");
    expect(windowLeft(hours(0.5), now)).toBe("30 min left");
    expect(windowLeft(hours(-1), now)).toBeNull();
    expect(windowLeft(null, now)).toBeNull();
    expect(windowLeft(hours(24 * 6), now)).toBe("6 days left");
  });

  it("the count beside the name", () => {
    const base = { newMessages: 0, threads: 1, posts: 1, kind: "dm", email: false };
    expect(rowCountLabel(base)).toBeNull();
    expect(rowCountLabel({ ...base, newMessages: 3 })).toBe("3 new");
    expect(rowCountLabel({ ...base, newMessages: 2, threads: 2, email: true })).toBe(
      "2 new · 2 subjects",
    );
    expect(rowCountLabel({ ...base, kind: "comment", newMessages: 2, posts: 2 })).toBe(
      "2 new · 2 posts",
    );
  });

  it('puts the "N new" line where the owner stopped reading', () => {
    const thread = [
      { from: "customer" as const, at: "2026-11-25T10:58:00Z" },
      { from: "business" as const, at: "2026-11-25T11:02:00Z" },
      { from: "customer" as const, at: "2026-11-25T11:38:00Z" },
      { from: "customer" as const, at: "2026-11-25T11:39:00Z" },
      { from: "customer" as const, at: "2026-11-25T11:40:00Z" },
    ];
    expect(newLineIndex(thread, 3, "2026-11-25T11:05:00Z")).toBe(2);
    // Never opened: before the last 3 customer messages.
    expect(newLineIndex(thread, 3, null)).toBe(2);
    expect(newLineIndex(thread, 0, null)).toBe(-1);
  });
});
