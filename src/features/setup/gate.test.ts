import { describe, expect, it } from "vitest";
import {
  isOpenPage,
  nextCookieValue,
  nextFromCookie,
  passHowOf,
  passTarget,
  resumeHref,
  safeNextPath,
  setupGate,
  showWelcomeBack,
} from "./gate";

const owner = { passed: false, role: "owner", staff: false };

describe("setupGate", () => {
  it("sends a new owner from an app page to setup, remembering the page", () => {
    expect(setupGate({ ...owner, path: "/inbox" })).toEqual({
      redirect: "/setup/resume?next=%2Finbox",
    });
    expect(setupGate({ ...owner, path: "/today?x=1" })).toEqual({
      redirect: "/setup/resume?next=%2Ftoday%3Fx%3D1",
    });
  });

  it("never sends anyone once the brand has passed", () => {
    expect(setupGate({ ...owner, passed: true, path: "/inbox" })).toBe("open");
  });

  it("never sends team members or staff", () => {
    for (const role of ["admin", "member", "viewer", null]) {
      expect(setupGate({ ...owner, role, path: "/inbox" })).toBe("open");
    }
    expect(setupGate({ ...owner, staff: true, path: "/inbox" })).toBe("open");
  });

  it("never gates setup, plan, account, staff, connect and public pages", () => {
    for (const path of [
      "/setup",
      "/setup?step=2",
      "/setup/resume",
      "/welcome",
      "/reveal",
      "/plan",
      "/plan?upgrade=auto_reply",
      "/settings/account",
      "/settings/billing",
      "/admin/brands",
      "/api/catch-up/progress",
      "/connect/done",
      "/invite/abc",
      "/login",
      "/signup",
      "/brands/new",
      "/more",
      "/",
    ]) {
      expect(setupGate({ ...owner, path }), path).toBe("open");
    }
  });

  it("gates every brand app page, including brand settings", () => {
    for (const path of [
      "/today",
      "/inbox/answered",
      "/contacts/leads",
      "/posts",
      "/teach/business-info",
      "/insights/work",
      "/settings",
      "/settings/accounts",
      "/settings/notifications",
    ]) {
      expect(setupGate({ ...owner, path }), path).not.toBe("open");
    }
  });

  it("resumes at the first step not done with the welcome back", () => {
    expect(resumeHref(3)).toBe("/setup?step=3&resume=1");
  });
});

describe("isOpenPage", () => {
  it("matches whole segments only", () => {
    expect(isOpenPage("/settings/account")).toBe(true);
    expect(isOpenPage("/settings/accounts")).toBe(false);
    expect(isOpenPage("/setupx")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site app pages with their query", () => {
    expect(safeNextPath("/inbox")).toBe("/inbox");
    expect(safeNextPath("/inbox/items/1?by=me#x")).toBe("/inbox/items/1?by=me");
  });

  it("rejects other sites and tricks", () => {
    for (const raw of [
      "https://evil.com/inbox",
      "//evil.com/inbox",
      "/\\evil.com",
      "inbox",
      "/inbox\n",
      "/in\u0000box",
      "",
      null,
      42,
      `/${"a".repeat(600)}`,
    ]) {
      expect(safeNextPath(raw), String(raw)).toBeNull();
    }
  });

  it("doesn't remember pages that never need setup", () => {
    expect(safeNextPath("/setup?step=2")).toBeNull();
    expect(safeNextPath("/login")).toBeNull();
  });
});

describe("the remembered page cookie", () => {
  it("belongs to one brand", () => {
    const v = nextCookieValue("t1", "/inbox?a=1");
    expect(nextFromCookie(v, "t1")).toBe("/inbox?a=1");
    expect(nextFromCookie(v, "t2")).toBeNull();
    expect(nextFromCookie(undefined, "t1")).toBeNull();
    expect(nextFromCookie("t1://evil.com", "t1")).toBeNull();
    expect(nextFromCookie("garbage", "t1")).toBeNull();
  });
});

describe("showWelcomeBack", () => {
  it("shows only after the gate, on a step, with something done", () => {
    expect(showWelcomeBack({ resume: "1", step: 3, done: 2 })).toBe(true);
    expect(showWelcomeBack({ resume: undefined, step: 3, done: 2 })).toBe(false);
    expect(showWelcomeBack({ resume: "1", step: 6, done: 5 })).toBe(false);
    expect(showWelcomeBack({ resume: "1", step: 1, done: 0 })).toBe(false);
  });
});

describe("passHowOf", () => {
  it("accepts only the two buttons", () => {
    expect(passHowOf("skipped")).toBe("skipped");
    expect(passHowOf("finish_later")).toBe("finish_later");
    expect(passHowOf("finished")).toBeNull();
    expect(passHowOf(null)).toBeNull();
  });
});

describe("passTarget", () => {
  it("goes on in setup or to Today, never elsewhere", () => {
    expect(passTarget("/setup?step=4", "skipped")).toBe("/setup?step=4");
    expect(passTarget("/today", "finish_later")).toBe("/today");
    expect(passTarget("https://evil.com", "skipped")).toBe("/setup");
    expect(passTarget("/inbox", "finish_later")).toBe("/today");
    expect(passTarget(null, "finish_later")).toBe("/today");
  });
});
