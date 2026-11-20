import { describe, expect, it } from "vitest";
import { conversationsAccessIssue, conversationsMetaSchema } from "./dm-access";

describe("conversationsAccessIssue", () => {
  const meta = (m: unknown) => conversationsMetaSchema.parse(m);

  it("an account listed fine has no issue", () => {
    expect(conversationsAccessIssue(meta({ accountsQueried: 1, accountsFailed: 0 }), "a1")).toBe(
      null,
    );
    expect(conversationsAccessIssue(meta(undefined), "a1")).toBe(null);
    expect(conversationsAccessIssue(meta({ failedAccounts: [{ accountId: "other" }] }), "a1")).toBe(
      null,
    );
  });

  it("a failed account is missing DM access, unless it was only rate limited", () => {
    expect(
      conversationsAccessIssue(
        meta({ failedAccounts: [{ accountId: "a1", error: "x", code: "PERMISSION_DENIED" }] }),
        "a1",
      ),
    ).toEqual({ issue: "no_access", code: "PERMISSION_DENIED" });
    expect(
      conversationsAccessIssue(
        meta({ failedAccounts: [{ accountId: "a1", error: "slow", retryAfter: 60 }] }),
        "a1",
      ),
    ).toEqual({ issue: "rate_limited", retryAfterSeconds: 60 });
  });

  it("an account skipped (not enabled for messages) is missing DM access", () => {
    expect(
      conversationsAccessIssue(
        meta({ accountsSkipped: [{ accountId: "a1", platform: "instagram" }] }),
        "a1",
      ),
    ).toEqual({ issue: "no_access", code: "skipped" });
  });

  it("a malformed meta reads as no issue", () => {
    expect(conversationsAccessIssue(meta({ failedAccounts: "nope" }), "a1")).toBe(null);
  });
});
