import { describe, expect, it } from "vitest";
import { connectNoteCopy, needsConnectNote, opensWelcome, safeContinueUrl } from "./connect-note";

const APP = "https://app.gowaggle.ai";

describe("Before you connect (18 Nov)", () => {
  it("Zernio's welcome page: straight there, no note", () => {
    expect(opensWelcome("https://zernio.com/connect/welcome?token=abc", APP)).toBe(true);
    expect(needsConnectNote("instagram", "https://zernio.com/connect/welcome?x=1", APP)).toBe(
      false,
    );
  });

  it("straight to the platform's page: the note first", () => {
    expect(
      needsConnectNote("googleanalytics", "https://accounts.google.com/o/oauth2/v2/auth?x", APP),
    ).toBe(true);
    expect(needsConnectNote("slack", "https://slack.com/oauth/v2/authorize?x", APP)).toBe(true);
  });

  it("X always shows the note, for its costs", () => {
    expect(needsConnectNote("twitter", "https://zernio.com/connect/welcome?x=1", APP)).toBe(true);
    expect(connectNoteCopy("twitter", "X").costs?.length).toBeGreaterThan(0);
  });

  it("the mock comes straight back to Waggle: no note", () => {
    expect(opensWelcome(`${APP}/settings/accounts?connected=slack`, APP)).toBe(true);
    expect(opensWelcome("http://localhost:3000/settings/accounts", undefined)).toBe(true);
  });

  it("a broken link is never treated as the welcome page", () => {
    expect(opensWelcome("not a url", APP)).toBe(false);
    expect(opensWelcome("https://evil.com/connect/welcome", APP)).toBe(false);
  });

  it("Continue only goes to https pages", () => {
    expect(safeContinueUrl("https://accounts.google.com/o/oauth2")).toContain(
      "accounts.google.com",
    );
    expect(safeContinueUrl("javascript:alert(1)")).toBeNull();
    expect(safeContinueUrl("http://example.com")).toBeNull();
    expect(safeContinueUrl(undefined)).toBeNull();
  });

  it("platforms without their own copy get a generic note", () => {
    expect(connectNoteCopy("hubspot", "HubSpot").platform).toBe("HubSpot");
  });
});
