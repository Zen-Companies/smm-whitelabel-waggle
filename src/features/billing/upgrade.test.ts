import { describe, expect, it } from "vitest";
import {
  isUpgradeReason,
  UPGRADE,
  UPGRADE_REASONS,
  upgradeHref,
  upgradeLabel,
  upgradeLine,
} from "./upgrade";

describe("every Free limit says how to lift it", () => {
  it("names the cheapest plan that lifts it, Solo or Team", () => {
    expect(upgradeLine("replies")).toBe(
      "To get more replies this month, upgrade to Solo or above.",
    );
    expect(upgradeLine("top_up")).toBe("To buy more replies, upgrade to Solo or above.");
    expect(upgradeLine("accounts")).toBe("To connect more accounts, upgrade to Solo or above.");
    expect(upgradeLine("team")).toBe("To invite your team, upgrade to Team or above.");
    expect(upgradeLabel("auto_reply")).toBe("Upgrade to Solo");
    expect(upgradeLabel("brands")).toBe("Upgrade to Team");
  });

  it("team features never point at Solo (Solo doesn't have them)", () => {
    for (const r of ["team", "follow_ups", "leads", "brands"] as const) {
      expect(UPGRADE[r].plan).toBe("business");
    }
  });

  it("never offers an add-on", () => {
    for (const r of UPGRADE_REASONS) {
      expect(upgradeLine(r)).not.toMatch(/\$15|\+200|top-up/i);
    }
  });

  it("opens Your plan with the screen for that limit", () => {
    expect(upgradeHref("accounts")).toBe("/plan?upgrade=accounts#upgrade");
    expect(isUpgradeReason("idle")).toBe(true);
    expect(isUpgradeReason("nope")).toBe(false);
  });
});
