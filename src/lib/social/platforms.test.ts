import { describe, expect, it } from "vitest";
import {
  COMMENTS_LIVE,
  CONNECTABLE,
  inboxRules,
  SETUP_IN_WAGGLE,
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

  it("answers on Meta, Google, TikTok, Threads, YouTube, LinkedIn and Bluesky (not X yet)", () => {
    expect(PLATFORM_IDS.filter(isInboxLive)).toEqual([
      "instagram",
      "facebook",
      "googlebusiness",
      "tiktok",
      "threads",
      "youtube",
      "linkedin",
      "bluesky",
    ]);
    expect(isInboxLive("twitter")).toBe(false);
  });

  it("knows each platform's inbox rules", () => {
    expect(inboxRules("instagram")).toMatchObject({ hide: true, privateReply: true });
    expect(inboxRules("tiktok").dmWindow).toEqual({ hours: 48, maxReplies: 10 });
    expect(inboxRules("bluesky")).toMatchObject({ hide: false, dmWindow: null, replyMax: 300 });
    expect(inboxRules("linkedin").hide).toBe(false);
    expect(inboxRules("myspace")).toMatchObject({ hide: false, privateReply: false });
    // Only Meta and TikTok list a comment's replies.
    expect(PLATFORM_IDS.filter((p) => inboxRules(p).listsReplies)).toEqual([
      "instagram",
      "facebook",
      "tiktok",
    ]);
  });

  it("backfills comments only where comments are live", () => {
    expect(COMMENTS_LIVE).not.toContain("googlebusiness");
    expect(COMMENTS_LIVE).toContain("youtube");
  });

  it("sets up Bluesky and Telegram in Waggle", () => {
    expect(SETUP_IN_WAGGLE).toEqual(["bluesky", "telegram"]);
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
