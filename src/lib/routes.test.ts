import { describe, expect, it } from "vitest";
import {
  automationsHref,
  businessInfoHref,
  inboxHref,
  insightsHref,
  legacyPath,
  settingsHref,
} from "./routes";

const old = (url: string) => {
  const u = new URL(url, "https://app.test");
  return legacyPath(u.pathname, u.searchParams);
};

describe("section links", () => {
  it("builds paths, with filters as query", () => {
    expect(settingsHref("accounts", { connected: "bluesky" })).toBe(
      "/settings/accounts?connected=bluesky",
    );
    expect(settingsHref("accounts", { setup: "telegram" }, "#setup")).toBe(
      "/settings/accounts?setup=telegram#setup",
    );
    expect(insightsHref()).toBe("/insights");
    expect(insightsHref("work", { period: 7 })).toBe("/insights/work?period=7");
    expect(inboxHref()).toBe("/inbox");
    expect(inboxHref("ignored", { item: "a", by: undefined })).toBe("/inbox/hidden?item=a");
    expect(automationsHref()).toBe("/teach/automations");
    expect(automationsHref("comments")).toBe("/teach/automations/comments");
    expect(businessInfoHref("new")).toBe("/teach/business-info?topic=new");
  });
});

describe("legacyPath", () => {
  it("forwards the old places, keeping the query", () => {
    expect(old("/leads")).toBe("/contacts/leads");
    expect(old("/leads?lead=9")).toBe("/contacts/leads?lead=9");
    expect(old("/leads/export")).toBe("/contacts/leads/export");
    expect(old("/knowledge-base?topic=new")).toBe("/teach/business-info?topic=new");
    expect(old("/automations?kind=comments&x=1")).toBe("/teach/automations/comments?x=1");
    expect(old("/automations")).toBe("/teach/automations");
    expect(old("/lab")).toBe("/teach/lab");
    expect(old("/analytics")).toBe("/insights");
    expect(old("/analytics?section=work&period=7")).toBe("/insights/work?period=7");
    expect(old("/analytics?section=nope")).toBe("/insights");
    expect(old("/analytics/posts.csv?period=30")).toBe("/insights/posts.csv?period=30");
  });

  it("forwards ?section= and ?tab=", () => {
    expect(old("/settings?section=accounts&connected=bluesky")).toBe(
      "/settings/accounts?connected=bluesky",
    );
    expect(old("/settings?section=account&email=changed")).toBe("/settings/account?email=changed");
    expect(old("/settings?section=replies")).toBe("/teach#replies");
    expect(old("/settings?section=bogus")).toBe("/settings/accounts");
    expect(old("/orgs/settings?section=team")).toBe("/orgs/settings/team");
    expect(old("/inbox?tab=answered&item=a&by=auto")).toBe("/inbox/answered?item=a&by=auto");
    expect(old("/inbox?tab=sent")).toBe("/inbox/answered");
    expect(old("/inbox?tab=ignored")).toBe("/inbox/hidden");
    expect(old("/inbox?tab=needs&item=b")).toBe("/inbox?item=b");
  });

  it("leaves current addresses alone", () => {
    for (const u of [
      "/inbox",
      "/inbox?item=a",
      "/settings",
      "/settings?connecting=x",
      "/settings/accounts",
      "/contacts/leads",
      "/insights/work?period=7",
      "/teach",
      "/today",
    ])
      expect(old(u)).toBeNull();
  });
});
