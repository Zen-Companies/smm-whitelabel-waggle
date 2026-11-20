import { describe, expect, it } from "vitest";
import {
  connectErrorHref,
  connectOrigin,
  connectReturnHref,
  DEFAULT_RETURN,
  firstConnectHref,
  safeReturnPath,
  withParams,
} from "./connect-return";

describe("safeReturnPath", () => {
  it("keeps our own pages with their query", () => {
    expect(safeReturnPath("/inbox")).toBe("/inbox");
    expect(safeReturnPath("/setup?step=2")).toBe("/setup?step=2");
    expect(safeReturnPath("/insights/posts?range=30")).toBe("/insights/posts?range=30");
    expect(safeReturnPath("/settings/accounts")).toBe("/settings/accounts");
    expect(safeReturnPath("/today")).toBe("/today");
  });

  it("drops the hash and earlier connect params", () => {
    expect(safeReturnPath("/inbox?tab=answered&connect_error=x&platform=y#top")).toBe(
      "/inbox?tab=answered",
    );
    expect(safeReturnPath("/setup?step=2&connecting=instagram&error=denied")).toBe("/setup?step=2");
  });

  it("refuses other sites and tricks", () => {
    for (const bad of [
      "https://evil.com/inbox",
      "//evil.com/inbox",
      "/\\evil.com",
      "\\\\evil.com",
      "javascript:alert(1)",
      "/inbox\n",
      "inbox",
      "",
      null,
      undefined,
      42,
      `/inbox?${"a".repeat(600)}`,
    ]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });

  it("refuses pages outside the list", () => {
    expect(safeReturnPath("/admin/brands")).toBeNull();
    expect(safeReturnPath("/api/connect/continue")).toBeNull();
    expect(safeReturnPath("/inboxes")).toBeNull();
    expect(safeReturnPath("/login")).toBeNull();
    expect(safeReturnPath("/inbox/../admin")).toBeNull();
  });
});

describe("connectOrigin", () => {
  it("reads the older setup value", () => {
    expect(connectOrigin("setup")).toBe("/setup?step=2");
  });
  it("falls back to Connected accounts", () => {
    expect(connectOrigin(null)).toBe(DEFAULT_RETURN);
    expect(connectOrigin("https://evil.com")).toBe(DEFAULT_RETURN);
  });
  it("keeps an allowed page", () => {
    expect(connectOrigin("/inbox")).toBe("/inbox");
  });
});

describe("where a connect lands", () => {
  it("sends the first account to setup step 2, wherever it started", () => {
    expect(connectReturnHref({ origin: "/inbox", platform: "instagram", firstAccount: true })).toBe(
      "/setup?step=2&connecting=instagram",
    );
    expect(firstConnectHref("facebook")).toBe("/setup?step=2&connecting=facebook");
  });

  it("sends later accounts back to where they started", () => {
    expect(connectReturnHref({ origin: "/inbox", platform: "tiktok", firstAccount: false })).toBe(
      "/inbox?connecting=tiktok",
    );
    expect(
      connectReturnHref({ origin: "/setup?step=2", platform: "tiktok", firstAccount: false }),
    ).toBe("/setup?step=2&connecting=tiktok");
  });

  it("sends errors back to the origin", () => {
    expect(connectErrorHref("/insights", "unavailable", "facebook")).toBe(
      "/insights?connect_error=unavailable&platform=facebook",
    );
    expect(connectErrorHref("/settings/accounts", "not_allowed")).toBe(
      "/settings/accounts?connect_error=not_allowed",
    );
  });

  it("adds params to a path", () => {
    expect(withParams("/settings/accounts", { before: "slack", back: "/inbox" })).toBe(
      "/settings/accounts?before=slack&back=%2Finbox",
    );
  });
});
