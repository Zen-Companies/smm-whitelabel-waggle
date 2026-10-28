import { describe, expect, it } from "vitest";
import { connectBanner } from "./connect-banner";

describe("connectBanner", () => {
  it("shows nothing without connect params", () => {
    expect(connectBanner({})).toBeNull();
  });

  it("confirms a finished connect flow", () => {
    expect(connectBanner({ connecting: "instagram" })).toEqual({
      tone: "info",
      text: "Instagram connected. It will appear here shortly.",
    });
  });

  it("shows Zernio's error message, capped", () => {
    const banner = connectBanner({
      connecting: "facebook",
      error: "no_facebook_pages",
      platform: "facebook",
      error_message: "Tick your Page. " + "x".repeat(400),
    });
    expect(banner?.tone).toBe("error");
    expect(banner?.text.startsWith("Couldn't connect Facebook: Tick your Page.")).toBe(true);
    expect(banner!.text.length).toBeLessThan(360);
  });

  it("falls back to a generic error", () => {
    expect(connectBanner({ error: "internal_error", platform: "instagram" })?.text).toBe(
      "Couldn't connect Instagram. Please try again.",
    );
  });

  it("treats code_already_redeemed as connecting, not failed", () => {
    expect(connectBanner({ error: "code_already_redeemed", platform: "instagram" })?.tone).toBe(
      "info",
    );
  });

  it("reports our own failure to start the flow", () => {
    expect(connectBanner({ connect_error: "unavailable", platform: "facebook" })).toEqual({
      tone: "error",
      text: "Couldn't start connecting Facebook. Please try again.",
    });
  });
});
