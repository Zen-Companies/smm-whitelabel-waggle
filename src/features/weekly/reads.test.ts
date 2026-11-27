import { describe, expect, it } from "vitest";
import { replyWindowMs, weeklyReads } from "./reads";

describe("weeklyReads (what the check-up can read per platform)", () => {
  it("reads comments and DMs on Instagram and Facebook", () => {
    expect(weeklyReads("instagram")).toEqual({ comments: true, dms: true });
    expect(weeklyReads("facebook")).toEqual({ comments: true, dms: true });
  });
  it("reads only comments where Zernio doesn't list the platform's conversations", () => {
    // TikTok DMs are in Waggle's inbox (webhooks) but not on Zernio's conversations list.
    expect(weeklyReads("tiktok")).toEqual({ comments: true, dms: false });
    expect(weeklyReads("youtube")).toEqual({ comments: true, dms: false });
  });
  it("reads conversations where Zernio lists them", () => {
    expect(weeklyReads("whatsapp")).toEqual({ comments: false, dms: true });
    expect(weeklyReads("sms")).toEqual({ comments: false, dms: true });
    expect(weeklyReads("bluesky")).toEqual({ comments: true, dms: true });
  });
  it("reads nothing on email and reviews (counted from what Waggle has)", () => {
    expect(weeklyReads("google")).toEqual({ comments: false, dms: false });
    expect(weeklyReads("imap")).toEqual({ comments: false, dms: false });
    expect(weeklyReads("googlebusiness")).toEqual({ comments: false, dms: false });
  });
  it("never reads platforms whose inbox Waggle doesn't run", () => {
    expect(weeklyReads("telegram")).toEqual({ comments: false, dms: false });
    expect(weeklyReads("twitter")).toEqual({ comments: false, dms: false });
  });
});

describe("replyWindowMs", () => {
  it("is the platform's own DM window", () => {
    expect(replyWindowMs("instagram")).toBe(24 * 3_600_000);
    expect(replyWindowMs("whatsapp")).toBe(24 * 3_600_000);
    expect(replyWindowMs("sms")).toBeNull();
  });
});
