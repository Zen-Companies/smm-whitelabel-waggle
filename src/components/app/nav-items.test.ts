import { describe, expect, it } from "vitest";
import { BOTTOM_TABS, isActive, NAV_ITEMS } from "./nav-items";

const tab = (label: string) => NAV_ITEMS.find((i) => i.label === label)!;

describe("nav items", () => {
  it("the menu uses the redesign's names, Today first", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Today",
      "Inbox",
      "Contacts",
      "Posts",
      "Teach Waggle",
      "Insights",
    ]);
    expect(isActive(tab("Contacts"), "/leads")).toBe(true);
    expect(BOTTOM_TABS.map((i) => i.label)).toEqual([
      "Today",
      "Inbox",
      "Contacts",
      "Teach",
      "More",
    ]);
  });

  it("Teach Waggle is active on Business info and the Lab", () => {
    const teach = tab("Teach Waggle");
    expect(isActive(teach, "/knowledge-base")).toBe(true);
    expect(isActive(teach, "/lab")).toBe(true);
    expect(isActive(teach, "/leads")).toBe(false);
  });

  it("More covers Posts, Insights and Settings on the phone", () => {
    const more = BOTTOM_TABS.find((i) => i.label === "More")!;
    for (const p of ["/more", "/posts", "/analytics", "/settings"])
      expect(isActive(more, p)).toBe(true);
    expect(isActive(more, "/inbox")).toBe(false);
  });

  it("a longer path isn't mistaken for a tab", () => {
    expect(isActive(tab("Inbox"), "/inboxes")).toBe(false);
    expect(isActive(tab("Inbox"), "/inbox/123")).toBe(true);
    expect(isActive(tab("Today"), "/inbox")).toBe(false);
  });
});
