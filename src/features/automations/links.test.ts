import { describe, expect, it } from "vitest";
import { buildFlow } from "./chat-flow";
import { chatLink, isChatLink, LINK_PLATFORMS, linkCode, pageHandle } from "./links";

describe("chat links", () => {
  it("Instagram and Facebook only", () => {
    expect([...LINK_PLATFORMS]).toEqual(["instagram", "facebook"]);
  });

  it("link codes are lowercase letters, digits and dashes", () => {
    expect(linkCode(" Table QR #1 ")).toBe("table-qr-1");
    expect(linkCode("---")).toBe("");
    expect(linkCode("a".repeat(80))).toHaveLength(40);
  });

  it("builds Meta's ig.me and m.me links", () => {
    expect(chatLink("instagram", "@harbourbean", "table-menu")).toBe("https://ig.me/m/harbourbean?ref=table-menu");
    expect(chatLink("facebook", "harbourbeancafe", "flyer-book")).toBe("https://m.me/harbourbeancafe?ref=flyer-book");
    expect(isChatLink("https://ig.me/m/harbourbean?ref=table-menu")).toBe(true);
    expect(isChatLink("Bookings by message")).toBe(false);
  });

  it("a page handle has no spaces; a Page name isn't one", () => {
    expect(pageHandle("harbourbeancafe")).toBe("harbourbeancafe");
    expect(pageHandle("facebook.com/harbourbeancafe/")).toBe("harbourbeancafe");
    expect(pageHandle("Harbour Bean Café")).toBeNull();
    expect(pageHandle(null)).toBeNull();
  });

  it("a link flow starts on its exact code", () => {
    const flow = buildFlow({ keywords: [], referral: "table-menu", steps: [{ kind: "send", text: "Menu" }] });
    expect(flow.nodes[0].config).toEqual({
      triggerType: "referral",
      referral: { ref: "table-menu", matchType: "exact" },
      cooldownHours: 24,
    });
  });
});
