import { describe, expect, it } from "vitest";
import { activityState } from "./conversation-data";
import { searchPattern, tabOf, todayLine } from "./inbox-data";
import { rowState } from "./row-note";

describe("todayLine without zeros (Inbox polish)", () => {
  it("says nothing happened instead of listing zeros", () => {
    expect(todayLine({ answered: 0, ignored: 0, hidden: 0 })).toBe(
      "Nothing answered on its own yet today.",
    );
  });
  it("leaves out the parts that are zero", () => {
    expect(todayLine({ answered: 4, ignored: 0, hidden: 0 })).toBe("Today Waggle answered 4.");
    expect(todayLine({ answered: 0, ignored: 2, hidden: 1 })).toBe(
      "Today Waggle ignored 2 and hid 1 spam comment.",
    );
  });
});

describe("searchPattern", () => {
  it("wraps the words for ilike and strips filter syntax", () => {
    expect(searchPattern("  ube  latte ")).toBe("%ube latte%");
    expect(searchPattern('a,b(c)"d%e_f*')).toBe("%a b c d e f%");
  });
  it("needs at least two letters", () => {
    expect(searchPattern("u")).toBeNull();
    expect(searchPattern(undefined)).toBeNull();
    expect(searchPattern(" , ")).toBeNull();
  });
});

describe("tabOf", () => {
  it("finds the tab a status lives in", () => {
    expect(tabOf("escalated")).toBe("for_you");
    expect(tabOf("sent")).toBe("answered");
    expect(tabOf("handled")).toBe("ignored");
    expect(tabOf("received")).toBeNull();
  });
});

describe("rowState", () => {
  it("maps a row to its honeycomb", () => {
    expect(rowState("failed", "complaint")).toBe("needs");
    expect(rowState("escalated", "lead")).toBe("working");
    expect(rowState("sent", "done")).toBe("working");
    expect(rowState("escalated", "info")).toBe("waiting");
    expect(rowState("awaiting_approval", "none")).toBe("waiting");
    expect(rowState("ignored", "none")).toBe("off");
  });
});

describe("activityState", () => {
  it("marks problems, waits and the rest", () => {
    expect(activityState("Handed to you: reply window closed")).toBe("needs");
    expect(activityState("Couldn't be sent")).toBe("needs");
    expect(activityState("Waiting for your OK")).toBe("waiting");
    expect(activityState("Approved by you")).toBe("working");
  });
});
