import { describe, expect, it } from "vitest";
import type { ProviderLog } from "@/lib/social";
import {
  buildStory,
  connectStatusLabel,
  deduce,
  findLinkRequest,
  findSignIn,
  fixHint,
  logWindow,
  type TraceAttempt,
  tryInProgress,
} from "./connect-story";

const T0 = "2026-11-26T16:57:24.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000);
const iso = (min: number) => at(min).toISOString();

const attempt = (over: Partial<TraceAttempt> = {}): TraceAttempt => ({
  platform: "facebook",
  startedAt: T0,
  returnedAt: null,
  outcome: null,
  outcomeAt: null,
  userAgentClass: "desktop_browser",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/131",
  zernioRequestId: null,
  ...over,
});

const log = (over: Partial<ProviderLog>): ProviderLog => ({
  type: "api_request",
  status: "success",
  statusCode: 200,
  action: null,
  eventType: null,
  errorMessage: null,
  errorCode: null,
  platform: null,
  accountId: null,
  successUsername: null,
  successAccountType: null,
  requestId: null,
  method: "GET",
  path: "/api/v1/connect/facebook",
  operationId: "getConnectUrl",
  createdAt: T0,
  ...over,
});

const linkOk = log({ requestId: "3018941fabcdef", createdAt: iso(0) });
const connected = log({
  type: "connections",
  platform: "facebook",
  action: "account.connected",
  eventType: "connect_success",
  successUsername: "harbourbean",
  successAccountType: "business",
  path: null,
  operationId: null,
  statusCode: null,
  createdAt: iso(3),
});
const noPages = log({
  type: "connections",
  platform: "facebook",
  status: "failed",
  action: "account.connect_failed",
  errorMessage: "No Facebook Pages found for this account",
  path: null,
  operationId: null,
  statusCode: null,
  createdAt: iso(2),
});

describe("logWindow", () => {
  it("reads from a minute before the tap to 3 hours after, never past now", () => {
    expect(logWindow(T0, at(600))).toEqual({ from: iso(-1), to: iso(180) });
    expect(logWindow(T0, at(11))).toEqual({ from: iso(-1), to: iso(11) });
  });
});

describe("findLinkRequest", () => {
  it("finds GET /v1/connect/<platform> near the tap", () => {
    expect(findLinkRequest(attempt(), [linkOk])).toBe(linkOk);
  });
  it("ignores other platforms, other calls and calls far from the tap", () => {
    expect(
      findLinkRequest(attempt(), [
        log({ path: "/api/v1/connect/instagram" }),
        log({ path: "/api/v1/posts", operationId: "createPost" }),
        log({ createdAt: iso(10) }),
      ]),
    ).toBeNull();
  });
  it("prefers the request id Waggle saved", () => {
    const other = log({ requestId: "b", createdAt: iso(0) });
    const mine = log({ requestId: "a", createdAt: iso(1) });
    expect(findLinkRequest(attempt({ zernioRequestId: "a" }), [other, mine])).toBe(mine);
  });
  it("accepts a path with a query", () => {
    const l = log({ path: "/api/v1/connect/facebook?profileId=p" });
    expect(findLinkRequest(attempt(), [l])).toBe(l);
  });
});

describe("findSignIn", () => {
  it("takes the first answer for the platform after the tap", () => {
    expect(findSignIn(attempt(), [connected, noPages], null)).toBe(noPages);
  });
  it("doesn't borrow the next try's answer", () => {
    expect(findSignIn(attempt(), [connected], iso(2))).toBeNull();
  });
  it("ignores other platforms and API request entries", () => {
    expect(
      findSignIn(attempt(), [{ ...connected, platform: "instagram" }, linkOk], null),
    ).toBeNull();
  });
});

describe("buildStory", () => {
  it("in progress with no answer: link made, waiting on Facebook, most likely box", () => {
    const s = buildStory({ attempt: attempt(), logs: [linkOk], nextStartedAt: null, now: at(11) });
    expect(s.steps.map((x) => [x.key, x.state])).toEqual([
      ["tapped", "done"],
      ["link", "done"],
      ["signin", "waiting"],
      ["back", "todo"],
      ["connected", "todo"],
    ]);
    expect(s.steps[1]).toMatchObject({ detail: "200 OK", requestId: "3018941fabcdef" });
    expect(s.steps[2]!.detail).toBe("no answer from Facebook yet (Zernio has no callback)");
    expect(s.likely?.headline).toBe("In progress · 11 min, probably still on Facebook's screens.");
    expect(s.likely?.reason).toMatch(/no Facebook Page/);
    expect(s.likely?.basis).toMatch(/^Deduced by Waggle/);
  });

  it("connected: all done, no most likely", () => {
    const s = buildStory({
      attempt: attempt({ returnedAt: iso(4), outcome: "connected", outcomeAt: iso(4) }),
      logs: [linkOk, connected],
      nextStartedAt: null,
      now: at(30),
    });
    expect(s.steps.every((x) => x.state === "done")).toBe(true);
    expect(s.steps[2]!.detail).toBe("connected · @harbourbean · business account");
    expect(s.likely).toBeNull();
  });

  it("Zernio's error word for word, with the fix", () => {
    const s = buildStory({
      attempt: attempt({ returnedAt: iso(2), outcome: "failed" }),
      logs: [linkOk, noPages],
      nextStartedAt: null,
      now: at(30),
    });
    expect(s.steps[2]).toMatchObject({
      state: "failed",
      quote: "No Facebook Pages found for this account",
      hint: "Can they fix it? Yes: they need a Facebook Page.",
    });
    expect(s.steps[4]!.state).toBe("failed");
    expect(s.likely).toBeNull();
  });

  it("link never made: Zernio's status and message, request id to send", () => {
    const bad = log({
      status: "failed",
      statusCode: 500,
      errorMessage: "Internal error",
      requestId: "req_9",
    });
    const s = buildStory({ attempt: attempt(), logs: [bad], nextStartedAt: null, now: at(5) });
    expect(s.steps[1]).toMatchObject({
      state: "failed",
      detail: "failed · Zernio 500",
      quote: "Internal error",
      requestId: "req_9",
    });
  });

  it("Zernio unreachable: Waggle's side only, no deduction", () => {
    const s = buildStory({ attempt: attempt(), logs: null, nextStartedAt: null, now: at(5) });
    expect(s.steps.map((x) => x.key)).toEqual(["tapped", "back", "connected"]);
    expect(s.likely).toBeNull();
  });

  it("no link in the log reads as unknown, not failed", () => {
    const s = buildStory({ attempt: attempt(), logs: [], nextStartedAt: null, now: at(5) });
    expect(s.steps[1]).toMatchObject({ state: "unknown", detail: "not in Zernio's log" });
  });
});

describe("deduce (the most likely table)", () => {
  it("in-app browser", () => {
    const d = deduce(attempt({ userAgentClass: "in_app_tiktok" }), null, at(10));
    expect(d.reason).toBe(
      "Opened inside TikTok's browser, which often breaks sign-in. Ask them to open Waggle in Safari or Chrome.",
    );
  });
  it("iPhone with Instagram", () => {
    const d = deduce(
      attempt({
        platform: "instagram",
        userAgentClass: "mobile_browser",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      }),
      null,
      at(10),
    );
    expect(d.reason).toBe(
      "On iPhone, Instagram may open its own app and not return to the browser.",
    );
  });
  it("desktop with Facebook", () => {
    expect(deduce(attempt(), null, at(10)).reason).toMatch(/^On a computer the usual reasons/);
  });
  it("no reason for other cases", () => {
    expect(
      deduce(attempt({ platform: "tiktok", userAgentClass: "mobile_browser" }), null, at(10))
        .reason,
    ).toBeNull();
  });
  it("after 2 hours: didn't finish", () => {
    const d = deduce(attempt({ outcome: "abandoned" }), null, at(200));
    expect(d.headline).toBe("Didn't finish Facebook's sign-in.");
    expect(d.basis).not.toMatch(/Abandoned/);
  });
  it("counts minutes from the link", () => {
    expect(deduce(attempt(), iso(1), at(11)).headline).toMatch(/· 10 min/);
  });
});

describe("fixHint", () => {
  it("knows a few of Zernio's messages", () => {
    expect(fixHint("No Facebook Pages found for this account", "facebook")).toMatch(
      /Facebook Page/,
    );
    expect(fixHint("Something else", "facebook")).toBeNull();
    expect(fixHint(null, "facebook")).toBeNull();
  });
});

describe("status label", () => {
  const now = at(11);
  it("in progress under 2 hours", () => {
    expect(tryInProgress({ outcome: null, startedAt: T0 }, now)).toBe("In progress · 11 min");
    expect(
      connectStatusLabel({
        stage: "connect",
        stageLabel: "Connect",
        lastTry: { outcome: null, startedAt: T0 },
        now,
      }),
    ).toEqual({ label: "In progress · 11 min", inProgress: true });
  });
  it("stuck after 2 hours, or once the try has an outcome", () => {
    expect(
      connectStatusLabel({
        stage: "connect",
        stageLabel: "Connect",
        lastTry: { outcome: null, startedAt: T0 },
        now: at(121),
      }).label,
    ).toBe("Stuck at Connect");
    expect(
      connectStatusLabel({
        stage: "connect",
        stageLabel: "Connect",
        lastTry: { outcome: "failed", startedAt: T0 },
        now,
      }).label,
    ).toBe("Stuck at Connect");
  });
  it("other stages and active are unchanged", () => {
    expect(
      connectStatusLabel({
        stage: "step2",
        stageLabel: "Step 2",
        lastTry: { outcome: null, startedAt: T0 },
        now,
      }).label,
    ).toBe("Stuck at Step 2");
    expect(
      connectStatusLabel({ stage: "active", stageLabel: "Active", lastTry: null, now }).label,
    ).toBe("Active");
  });
  it("a sign-up with no business never tapped Connect", () => {
    expect(
      connectStatusLabel({
        stage: "no_business",
        stageLabel: "No business yet",
        lastTry: null,
        now,
      }),
    ).toEqual({ label: "Signed up · never tapped Connect", inProgress: false });
  });
});

describe("fixHint from Zernio's real failure (23 Nov)", () => {
  it("matches the error code even when the message doesn't say 'no pages'", () => {
    expect(fixHint("Meta returned zero managed Pages", "facebook", "no_facebook_pages")).toMatch(
      /Facebook Page/,
    );
    expect(fixHint("Meta returned zero managed Pages", "facebook")).toMatch(/Facebook Page/);
  });
});
