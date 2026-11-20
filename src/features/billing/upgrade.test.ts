import { describe, expect, it } from "vitest";
import {
  isOfferReason,
  upgradeCopy,
  WELCOME_HREF,
  isUpgradeReason,
  UPGRADE,
  UPGRADE_REASONS,
  upgradeHref,
  upgradeLabel,
  upgradeLine,
} from "./upgrade";
import { PLANS } from "./plans";

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

describe("limits say the numbers staff set (decision 10)", () => {
  it("reads accounts and replies from the plans, never typed in", () => {
    const plans = structuredClone(PLANS);
    plans.solo.accounts = 4;
    plans.solo.replies = 350;
    expect(upgradeCopy("accounts", plans).why).toBe(
      "Your account is connected. Solo connects 4, Team 6.",
    );
    expect(upgradeCopy("top_up", plans).why).toContain("350 replies a month");
    expect(upgradeCopy("extra_account", plans).why).toContain("already connects 4");
  });
});

describe("the upgrade pop-up opens over any page (contract for setup)", () => {
  it("adds ?upgrade= to the page, keeping its own query", () => {
    expect(upgradeHref("auto_reply", "/setup")).toBe("/setup?upgrade=auto_reply");
    expect(upgradeHref("accounts", "/setup?step=2&screen=3")).toBe(
      "/setup?step=2&screen=3&upgrade=accounts",
    );
    expect(upgradeHref("nudge", "/today?upgrade=old")).toBe("/today?upgrade=nudge");
  });

  it("knows the pop-up's own reasons", () => {
    expect(isOfferReason("out")).toBe(true);
    expect(isOfferReason("nudge")).toBe(true);
    expect(isOfferReason("auto_reply")).toBe(true);
    expect(isOfferReason("free")).toBe(false);
    expect(WELCOME_HREF).toBe("/inbox?welcome=1");
  });
});
