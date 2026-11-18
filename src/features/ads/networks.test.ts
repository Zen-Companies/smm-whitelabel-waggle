import { describe, expect, it } from "vitest";
import { ADS_ELSEWHERE, minDailyFor, networkOfConnection, networkOfPlatform } from "./networks";

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

  it("lists the networks connected in Settings, by their Zernio connection", () => {
    expect(ADS_ELSEWHERE.map((n) => n.connection)).toEqual([
      "googleads",
      "tiktokads",
      "redditads",
      "microsoftads",
      "xads",
    ]);
  });

  it("uses the account's own minimum, else the network's USD floor", () => {
    expect(minDailyFor("meta", { minDailyBudget: 50, currency: "PHP" })).toBe(50);
    expect(minDailyFor("linkedin", { minDailyBudget: null, currency: "USD" })).toBe(10);
    expect(minDailyFor("pinterest", { minDailyBudget: null, currency: "USD" })).toBe(5);
    expect(minDailyFor("linkedin", { minDailyBudget: null, currency: "EUR" })).toBe(1);
  });
});
