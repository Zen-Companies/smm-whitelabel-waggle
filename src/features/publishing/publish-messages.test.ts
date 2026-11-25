import { describe, expect, it } from "vitest";
import { SocialProviderError } from "@/lib/social/types";
import { platformList, postErrorMessage, postMediaFromRow } from "./publish";

// Posts round 1 (25 Nov): a refused post names the platforms it was going to, and every file
// goes to Zernio with its kind.

describe("postErrorMessage", () => {
  const refused = new SocialProviderError("x", { status: 400, ambiguous: false });

  it("names the real platforms on a 400/422", () => {
    expect(postErrorMessage(refused, ["linkedin"])).toBe(
      "LinkedIn didn't accept this post. Check the text and the photo or video, then try again.",
    );
    expect(postErrorMessage(refused, ["instagram", "facebook", "instagram"])).toMatch(
      /^Instagram or Facebook didn't accept/,
    );
  });

  it("lists names with commas and a final or", () => {
    expect(platformList(["instagram", "tiktok", "youtube"])).toBe("Instagram, TikTok or YouTube");
    expect(platformList([])).toBe("The platform");
  });
});

describe("postMediaFromRow", () => {
  it("keeps each file's stored kind and alt text; older rows have only the url", () => {
    expect(
      postMediaFromRow([
        { url: "https://m.test/abc", seconds: 12, type: "video" },
        { url: "https://m.test/a.jpg", altText: "Ube" },
        { url: "https://m.test/b", type: "sticker" },
        {},
      ]),
    ).toEqual([
      { url: "https://m.test/abc", type: "video" },
      { url: "https://m.test/a.jpg", type: null, altText: "Ube" },
      { url: "https://m.test/b", type: null },
    ]);
  });
});
