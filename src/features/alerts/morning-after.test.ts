import { describe, expect, it } from "vitest";
import { decideMorning, expiryLine, morningEmail, morningWindow } from "./morning-after";

const utc = (s: string) => new Date(`${s}Z`);

describe("morningWindow", () => {
  it("without a time zone: 13:00–15:00 UTC the next day", () => {
    const w = morningWindow(utc("2026-11-20T18:00:00"), null);
    expect(w.from.toISOString()).toBe("2026-11-21T13:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-21T15:00:00.000Z");
  });

  it("a connect in the small hours gets that same morning (6 hours on)", () => {
    expect(morningWindow(utc("2026-11-20T03:00:00"), null).from.toISOString()).toBe(
      "2026-11-20T13:00:00.000Z",
    );
    // Under 6 hours before the window: the next morning.
    expect(morningWindow(utc("2026-11-20T08:00:00"), null).from.toISOString()).toBe(
      "2026-11-21T13:00:00.000Z",
    );
  });

  it("with a time zone: 8–10am there", () => {
    // 7pm in Manila (UTC+8) → 8am Manila the next day = 00:00 UTC.
    const w = morningWindow(utc("2026-11-20T11:00:00"), "Asia/Manila");
    expect(w.from.toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-21T02:00:00.000Z");
  });
});

describe("decideMorning", () => {
  const window = { from: utc("2026-11-21T13:00:00"), to: utc("2026-11-21T15:00:00") };
  it("waits for the morning, sends inside it, settles it after", () => {
    const at = (t: string) => ({ now: utc(t), window, messages: 6, replies: 4 });
    expect(decideMorning(at("2026-11-21T12:59:00"))).toBe("wait");
    expect(decideMorning(at("2026-11-21T13:00:00"))).toBe("send");
    expect(decideMorning(at("2026-11-21T15:00:00"))).toBe("skip_passed");
  });
  it("sends nothing when nothing new came in, or no reply is ready", () => {
    const now = utc("2026-11-21T14:00:00");
    expect(decideMorning({ now, window, messages: 0, replies: 4 })).toBe("skip_nothing_new");
    expect(decideMorning({ now, window, messages: 6, replies: 0 })).toBe("skip_nothing_new");
  });
});

describe("expiryLine", () => {
  const now = utc("2026-11-21T13:30:00");
  it("names the hour in the owner's zone", () => {
    expect(
      expiryLine({ count: 1, first: utc("2026-11-21T19:00:00") }, now, "America/New_York"),
    ).toBe("1 message expires at 2pm.");
    expect(
      expiryLine({ count: 3, first: utc("2026-11-21T19:30:00") }, now, "America/New_York"),
    ).toBe("3 messages expire soon, the first at 2:30pm.");
  });
  it("says how long is left without a zone, and nothing when none expire", () => {
    expect(expiryLine({ count: 1, first: utc("2026-11-21T18:30:00") }, now, null)).toBe(
      "1 message expires in 5 hours.",
    );
    expect(expiryLine(null, now, null)).toBeNull();
    expect(expiryLine({ count: 0, first: now }, now, null)).toBeNull();
  });
});

describe("morningEmail", () => {
  const input = {
    firstName: "Jason",
    handle: "@harbourbean",
    orgName: "Harbour Bean Café",
    messages: 6,
    customers: 6,
    replies: 4,
    expiry: "1 message expires at 2pm.",
    appUrl: "https://app.gowaggle.ai/",
  };
  it("matches the board", () => {
    const email = morningEmail(input);
    expect(email.subject).toBe("Waggle caught 6 new messages overnight");
    expect(email.text).toContain(
      "Good morning, Jason. 6 customers wrote to @harbourbean overnight. 4 replies are ready for you to approve. 1 message expires at 2pm.",
    );
    expect(email.text).toContain("Approve 4 replies: https://app.gowaggle.ai/inbox");
    expect(email.text).toContain(
      "Sent once, the morning after you connect. Turn these off in Tell me when.",
    );
    expect(email.html).toContain("Approve 4 replies");
    expect(email.html).toContain("https://app.gowaggle.ai/settings/notifications");
  });
  it("leaves out the expiry line when nothing expires, and counts one plainly", () => {
    const email = morningEmail({
      ...input,
      messages: 1,
      customers: 1,
      replies: 1,
      expiry: null,
      firstName: null,
    });
    expect(email.subject).toBe("Waggle caught 1 new message overnight");
    expect(email.text).toContain(
      "Good morning. 1 customer wrote to @harbourbean overnight. 1 reply is ready for you to approve.",
    );
    expect(email.text).not.toContain("expires");
    expect(email.text).toContain("Approve 1 reply:");
  });
});
