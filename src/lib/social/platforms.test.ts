import { describe, expect, it } from "vitest";
import {
  CONNECTABLE,
  isConnectable,
  isInboxLive,
  PASSWORD_CONNECT,
  PLATFORM_IDS,
  PLATFORMS,
  platformLabel,
} from "./platforms";

describe("platform registry", () => {
  it("has one entry per id, keyed by its own id", () => {
    for (const id of PLATFORM_IDS) expect(PLATFORMS[id].id).toBe(id);
  });

  it("connects only through Zernio's sign-in for now", () => {
    expect(CONNECTABLE).toContain("tiktok");
    expect(CONNECTABLE).toContain("googlebusiness");
    expect(isConnectable("bluesky")).toBe(false);
    expect(isConnectable("snapchat")).toBe(false);
    expect(isConnectable("whatsapp")).toBe(false);
  });

  it("connects Bluesky with an app password typed in Waggle", () => {
    expect(PASSWORD_CONNECT).toEqual(["bluesky"]);
  });

  it("keeps the inbox to Instagram and Facebook until later waves", () => {
    expect(PLATFORM_IDS.filter(isInboxLive)).toEqual(["instagram", "facebook"]);
  });

  it("never marks a platform as live in the inbox when Zernio has no inbox for it", () => {
    for (const id of PLATFORM_IDS) {
      const p = PLATFORMS[id];
      if (p.inboxLive) expect(p.inbox.comments || p.inbox.dms || p.inbox.reviews).toBe(true);
      if (p.kind === "posts")
        expect(p.inbox).toEqual({ comments: false, dms: false, reviews: false });
    }
  });

  it("labels X by its name and unknown ids as they are", () => {
    expect(platformLabel("twitter")).toBe("X");
    expect(platformLabel("myspace")).toBe("myspace");
  });
});
