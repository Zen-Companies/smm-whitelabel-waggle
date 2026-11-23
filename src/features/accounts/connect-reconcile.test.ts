import { describe, expect, it } from "vitest";
import type { AccountHealth } from "@/lib/social/types";
import { accountsToAdopt } from "./connect-reconcile";

const h = (over: Partial<AccountHealth>): AccountHealth => ({
  accountId: "acc-1",
  platform: "instagram",
  username: "sunnyside",
  status: "healthy",
  needsReconnect: false,
  canPost: true,
  issues: [],
  ...over,
});

describe("accountsToAdopt", () => {
  it("adds a working account Waggle doesn't know yet", () => {
    expect(accountsToAdopt([h({})], new Set())).toEqual([
      { zernioAccountId: "acc-1", platform: "instagram", username: "sunnyside" },
    ]);
  });
  it("skips known, broken and non-social accounts", () => {
    expect(
      accountsToAdopt(
        [
          h({ accountId: "known" }),
          h({ accountId: "a", needsReconnect: true }),
          h({ accountId: "b", status: "error" }),
          h({ accountId: "c", platform: "googleanalytics" }),
        ],
        new Set(["known"]),
      ),
    ).toEqual([]);
  });
  it("keeps a warning account and a missing username", () => {
    expect(accountsToAdopt([h({ status: "warning", username: null })], new Set())).toEqual([
      { zernioAccountId: "acc-1", platform: "instagram", username: "" },
    ]);
  });
});
