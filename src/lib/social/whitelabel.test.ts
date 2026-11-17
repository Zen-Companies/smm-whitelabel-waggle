import { describe, expect, it } from "vitest";
import { connectBranding, customerText } from "./whitelabel";

describe("connectBranding", () => {
  it("shows Waggle's welcome screen with its name, colour and logo on https", () => {
    expect(connectBranding("https://app.gowaggle.ai")).toEqual({
      welcome: true,
      brandName: "Waggle",
      primaryColor: "#F6B21B",
      logoUrl: "https://app.gowaggle.ai/brand/waggle-app-icon.svg",
    });
  });

  it("leaves the logo out off https (Zernio refuses a non-https logo)", () => {
    expect(connectBranding("http://localhost:3000")).toEqual({
      welcome: true,
      brandName: "Waggle",
      primaryColor: "#F6B21B",
    });
  });

  it("ignores a trailing slash", () => {
    expect(connectBranding("https://app.gowaggle.ai/").logoUrl).toBe(
      "https://app.gowaggle.ai/brand/waggle-app-icon.svg",
    );
  });
});

describe("customerText", () => {
  it("keeps a platform's own reason as it is", () => {
    expect(customerText("instagram: Media is too large")).toBe("instagram: Media is too large");
  });

  it("never names Zernio", () => {
    expect(customerText("tiktok: Zernio could not reach TikTok")).toBe(
      "tiktok: our posting service could not reach TikTok",
    );
    expect(customerText("ZERNIO_TIMEOUT")).toBe("our posting service_TIMEOUT");
  });

  it("keeps null and empty as they are", () => {
    expect(customerText(null)).toBeNull();
    expect(customerText("")).toBe("");
  });
});
