import { describe, expect, it } from "vitest";
import { lookedLike, openOnPlatformHref } from "./held-card";

describe("lookedLike", () => {
  it("names the best guess only for messages Waggle wasn't sure about", () => {
    expect(lookedLike("low_confidence", { category: "faq" })).toBe(
      "It looked most like a question.",
    );
    expect(lookedLike("unclear", { category: "unclear" })).toBeNull();
    expect(lookedLike("complaint", { category: "complaint" })).toBeNull();
    expect(lookedLike(null, { category: "faq" })).toBeNull();
  });
});

describe("openOnPlatformHref", () => {
  it("opens the post for a comment, the inbox for a DM", () => {
    expect(
      openOnPlatformHref({
        kind: "comment",
        platform: "instagram",
        permalink: "https://www.instagram.com/p/X/",
      }),
    ).toBe("https://www.instagram.com/p/X/");
    expect(
      openOnPlatformHref({ kind: "comment", platform: "instagram", permalink: null }),
    ).toBeNull();
    expect(openOnPlatformHref({ kind: "dm", platform: "instagram", permalink: null })).toBe(
      "https://www.instagram.com/direct/inbox/",
    );
    expect(openOnPlatformHref({ kind: "dm", platform: "facebook", permalink: null })).toBe(
      "https://www.facebook.com/messages/",
    );
  });
});
