import { describe, expect, it } from "vitest";
import type { AccountHealth, AccountsHealthReport } from "@/lib/social/types";
import { healthStep } from "./health";

const h = (over: Partial<AccountHealth> = {}): AccountHealth => ({
  accountId: "acc-1",
  platform: "instagram",
  username: "sunnyside",
  status: "healthy",
  needsReconnect: false,
  canPost: true,
  issues: [],
  ...over,
});
const report = (accounts: AccountHealth[], complete = true): AccountsHealthReport => ({
  accounts,
  complete,
});
const active = { zernio_account_id: "acc-1", status: "active", released_at: null };

describe("healthStep (hourly account health check)", () => {
  it("missing from a complete answer: checked one by one, then disconnected if gone", () => {
    expect(healthStep(active, report([h({ accountId: "other" })]))).toEqual({
      kind: "check_gone",
    });
    // Zernio says the profile has no accounts at all (total 0, nothing listed).
    expect(healthStep(active, report([]))).toEqual({ kind: "check_gone" });
  });

  it("present and healthy: unchanged", () => {
    expect(healthStep(active, report([h()]))).toEqual({ kind: "none" });
    expect(healthStep(active, report([h({ status: "warning" })]))).toEqual({ kind: "none" });
  });

  it("a partial or unconfirmed answer (paging, other profiles, no total): unchanged", () => {
    expect(healthStep(active, report([h({ accountId: "other" })], false))).toEqual({
      kind: "none",
    });
    expect(healthStep(active, report([], false))).toEqual({ kind: "none" });
  });

  it("missing but already disconnected: nothing to do", () => {
    expect(healthStep({ ...active, status: "disconnected" }, report([]))).toEqual({
      kind: "none",
    });
  });

  it("broken in Zernio: disconnected with Zernio's issues as the reason", () => {
    expect(
      healthStep(active, report([h({ status: "error", issues: ["token_expired", "scopes"] })])),
    ).toEqual({ kind: "disconnect", reason: "token_expired, scopes" });
    expect(healthStep(active, report([h({ needsReconnect: true, status: "warning" })]))).toEqual({
      kind: "disconnect",
      reason: "warning",
    });
  });

  it("healthy again: recovered, unless the owner disconnected it", () => {
    const down = { ...active, status: "disconnected" };
    expect(healthStep(down, report([h()]))).toEqual({
      kind: "recover",
      platform: "instagram",
      username: "sunnyside",
    });
    expect(healthStep({ ...down, released_at: "2026-11-25T00:00:00Z" }, report([h()]))).toEqual({
      kind: "none",
    });
    expect(healthStep(down, report([h({ platform: "googleanalytics" })]))).toEqual({
      kind: "none",
    });
  });
});
