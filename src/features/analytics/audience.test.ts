import { describe, expect, it } from "vitest";
import { mockDemographics } from "@/lib/social/mock-analytics";
import {
  ageShares,
  cityName,
  countryName,
  genderLine,
  lastDays,
  shares,
  shareText,
} from "./audience";

describe("audience shares", () => {
  const ig = mockDemographics("instagram");

  it("orders age groups young to old as percents", () => {
    const ages = ageShares(ig);
    expect(ages.map((a) => a.label)).toEqual([
      "13–17",
      "18–24",
      "25–34",
      "35–44",
      "45–54",
      "55–64",
    ]);
    expect(Math.round(ages[2].share)).toBe(38);
  });

  it("writes the gender split as a line", () => {
    expect(genderLine(ig)).toBe("Women 64%, men 34%, not given 2%.");
    expect(genderLine({ city: [] })).toBeNull();
  });

  it("measures cities against all followers, not only the listed cities", () => {
    const cities = shares(ig, "city");
    expect(cityName(cities[0].key)).toBe("Quezon City");
    // 310 of 960 followers counted by country.
    expect(Math.round(cities[0].share)).toBe(32);
  });

  it("names countries and prints small shares", () => {
    expect(countryName("PH")).toBe("Philippines");
    expect(countryName("??")).toBe("??");
    expect(shareText(0.4)).toBe("<1%");
    expect(shareText(37.6)).toBe("38%");
  });

  it("keeps the last days of a series", () => {
    const pts = [{ date: "2026-11-03" }, { date: "2026-11-01" }, { date: "2026-11-02" }];
    expect(lastDays(pts, 2).map((p) => p.date)).toEqual(["2026-11-02", "2026-11-03"]);
  });
});
