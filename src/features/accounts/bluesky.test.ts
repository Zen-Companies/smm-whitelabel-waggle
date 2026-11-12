import { describe, expect, it } from "vitest";
import { SocialProviderError } from "@/lib/social/types";
import { blueskyErrorFor, blueskyErrorText, blueskyInputSchema } from "./bluesky";

const refused = (status: number) => new SocialProviderError("x", { status, ambiguous: false });

describe("Bluesky connect", () => {
  it("takes the handle with or without @, trimmed", () => {
    expect(
      blueskyInputSchema.parse({ identifier: "  @cafe.bsky.social ", appPassword: " a-b " }),
    ).toEqual({ identifier: "cafe.bsky.social", appPassword: "a-b" });
  });

  it("asks for both fields", () => {
    expect(blueskyInputSchema.safeParse({ identifier: "", appPassword: "x" }).success).toBe(false);
    expect(blueskyInputSchema.safeParse({ identifier: "cafe", appPassword: " " }).success).toBe(
      false,
    );
  });

  it("maps Zernio's refusals to what the owner can do", () => {
    expect(blueskyErrorFor(refused(401))).toBe("bad_credentials");
    expect(blueskyErrorFor(refused(400))).toBe("bad_credentials");
    expect(blueskyErrorFor(refused(402))).toBe("plan_limit");
    expect(blueskyErrorFor(refused(500))).toBe("unavailable");
    expect(blueskyErrorFor(new Error("boom"))).toBe("unavailable");
  });

  it("tells the owner to use an app password, not the main one", () => {
    expect(blueskyErrorText("bad_credentials")).toMatch(/app password, not your main password/);
  });
});
