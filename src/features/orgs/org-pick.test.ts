import { describe, expect, it } from "vitest";
import { chooseOpenOrg, type OrgSummary } from "./org-pick";

const org = (id: string, personal = false): OrgSummary => ({
  id,
  name: id,
  personal,
  role: "owner",
  allBrands: true,
});

describe("chooseOpenOrg", () => {
  const orgs = [org("group"), org("client"), org("mine", true)];
  it("opens the cookie's organization", () => {
    expect(chooseOpenOrg(orgs, "client", "group")?.id).toBe("client");
  });
  it("falls back to the open brand's organization", () => {
    expect(chooseOpenOrg(orgs, "stale", "group")?.id).toBe("group");
  });
  it("then the personal organization", () => {
    expect(chooseOpenOrg(orgs, undefined, null)?.id).toBe("mine");
  });
  it("is null in no organization", () => {
    expect(chooseOpenOrg([], "x")).toBeNull();
  });
});
