import { describe, expect, it } from "vitest";
import { ADS_COMING_SOON, minDailyFor, networkOfConnection, networkOfPlatform } from "./networks";

describe("ad networks (T79b)", () => {
  it("maps posting platforms and ads connections to networks", () => {
    expect(networkOfPlatform("instagram")).toBe("meta");
    expect(networkOfPlatform("linkedin")).toBe("linkedin");
    expect(networkOfPlatform("pinterest")).toBe("pinterest");
    expect(networkOfPlatform("tiktok")).toBeNull();
    expect(networkOfConnection("linkedinads")).toBe("linkedin");
    expect(networkOfConnection("pinterestads")).toBe("pinterest");
    expect(networkOfConnection("googleads")).toBeNull();
  });

  it("holds the networks that sign in through the partner's own app", () => {
    expect(ADS_COMING_SOON).toEqual([
      "Google Ads",
      "TikTok Ads",
      "Reddit Ads",
      "Microsoft Ads",
      "X Ads",
    ]);
  });

  it("uses the account's own minimum, else the network's USD floor", () => {
    expect(minDailyFor("meta", { minDailyBudget: 50, currency: "PHP" })).toBe(50);
    expect(minDailyFor("linkedin", { minDailyBudget: null, currency: "USD" })).toBe(10);
    expect(minDailyFor("pinterest", { minDailyBudget: null, currency: "USD" })).toBe(5);
    expect(minDailyFor("linkedin", { minDailyBudget: null, currency: "EUR" })).toBe(1);
  });
});
