import { describe, expect, it } from "vitest";
import { BOTTOM_TABS, isActive, NAV_ITEMS } from "./nav-items";

describe("nav items", () => {
  it("the menu uses the redesign's names", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Inbox", "Contacts", "Posts", "Teach Waggle", "Insights"]);
  });

  it("Teach Waggle is active on Business info and the Lab", () => {
    const teach = NAV_ITEMS.find((i) => i.label === "Teach Waggle")!;
    expect(isActive(teach, "/knowledge-base")).toBe(true);
    expect(isActive(teach, "/lab")).toBe(true);
    expect(isActive(teach, "/leads")).toBe(false);
  });

  it("More covers Posts, Insights and Settings on the phone", () => {
    const more = BOTTOM_TABS.find((i) => i.label === "More")!;
    for (const p of ["/more", "/posts", "/analytics", "/settings"]) expect(isActive(more, p)).toBe(true);
    expect(isActive(more, "/inbox")).toBe(false);
  });

  it("a longer path isn't mistaken for a tab", () => {
    expect(isActive(NAV_ITEMS[0], "/inboxes")).toBe(false);
    expect(isActive(NAV_ITEMS[0], "/inbox/123")).toBe(true);
  });
});
