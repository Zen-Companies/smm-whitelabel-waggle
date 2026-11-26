import { describe, expect, it } from "vitest";
import { CONNECT_ABANDON_AFTER_MS } from "./connect-trace";
import {
  CONNECT_UNFINISHED_AFTER_MS,
  connectTroubleTips,
  unfinishedConnect,
  unfinishedNoteText,
  unfinishedTimers,
  type ConnectTry,
} from "./connect-unfinished";

const NOW = new Date("2026-11-26T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;

const t = (over: Partial<ConnectTry> = {}): ConnectTry => ({
  id: "a1",
  platform: "facebook",
  startedAt: ago(5 * MIN),
  outcome: null,
  ...over,
});

describe("unfinishedConnect", () => {
  it("hides a try under 1 minute old", () => {
    expect(unfinishedConnect([t({ startedAt: ago(30_000) })], [], NOW)).toBeNull();
    expect(unfinishedConnect([t({ startedAt: ago(MIN - 1) })], [], NOW)).toBeNull();
  });

  it("shows a try between 1 minute and 2 hours old", () => {
    expect(unfinishedConnect([t({ startedAt: ago(MIN) })], [], NOW)?.id).toBe("a1");
    expect(unfinishedConnect([t({ startedAt: ago(90 * MIN) })], [], NOW)?.id).toBe("a1");
    expect(
      unfinishedConnect([t({ startedAt: ago(CONNECT_ABANDON_AFTER_MS - 1) })], [], NOW)?.id,
    ).toBe("a1");
  });

  it("hides a try 2 hours old or more", () => {
    expect(
      unfinishedConnect([t({ startedAt: ago(CONNECT_ABANDON_AFTER_MS) })], [], NOW),
    ).toBeNull();
    expect(unfinishedConnect([t({ startedAt: ago(3 * 60 * MIN) })], [], NOW)).toBeNull();
  });

  it("hides a try whose outcome is set", () => {
    for (const outcome of ["connected", "failed", "returned_without_account", "abandoned"]) {
      expect(unfinishedConnect([t({ outcome })], [], NOW)).toBeNull();
    }
  });

  it("hides a try for a platform connected now", () => {
    expect(unfinishedConnect([t()], ["facebook"], NOW)).toBeNull();
    expect(unfinishedConnect([t()], ["instagram"], NOW)?.id).toBe("a1");
  });

  it("uses only the latest try per platform", () => {
    // A newer try that came back with an error hides the older open one.
    const older = t({ id: "old", startedAt: ago(30 * MIN) });
    const newer = t({ id: "new", startedAt: ago(10 * MIN), outcome: "failed" });
    expect(unfinishedConnect([older, newer], [], NOW)).toBeNull();
    // A newer try under a minute old hides the older one too (the owner just tried again).
    const fresh = t({ id: "fresh", startedAt: ago(20_000) });
    expect(unfinishedConnect([older, fresh], [], NOW)).toBeNull();
    // The newer open one wins, whatever the order given.
    const open = t({ id: "open", startedAt: ago(5 * MIN) });
    expect(unfinishedConnect([open, older], [], NOW)?.id).toBe("open");
  });

  it("picks the most recent qualifying try across platforms", () => {
    const fb = t({ id: "fb", platform: "facebook", startedAt: ago(40 * MIN) });
    const ig = t({ id: "ig", platform: "instagram", startedAt: ago(10 * MIN) });
    const igDone = t({
      id: "ig2",
      platform: "instagram",
      startedAt: ago(5 * MIN),
      outcome: "failed",
    });
    expect(unfinishedConnect([fb, ig], [], NOW)?.id).toBe("ig");
    expect(unfinishedConnect([fb, ig, igDone], [], NOW)?.id).toBe("fb");
  });

  it("ignores a bad date and a try from the future", () => {
    expect(unfinishedConnect([t({ startedAt: "not a date" })], [], NOW)).toBeNull();
    expect(unfinishedConnect([t({ startedAt: ago(-5 * MIN) })], [], NOW)).toBeNull();
  });

  it("can drop the 1-minute floor (the page waits for it in the browser)", () => {
    expect(unfinishedConnect([t({ startedAt: ago(10_000) })], [], NOW, 0)?.id).toBe("a1");
  });
});

describe("unfinishedTimers", () => {
  it("says when the note appears and goes, from the server's clock", () => {
    const a = t({ startedAt: ago(20_000) });
    expect(unfinishedTimers(a, NOW)).toEqual({
      showInMs: CONNECT_UNFINISHED_AFTER_MS - 20_000,
      hideInMs: CONNECT_ABANDON_AFTER_MS - 20_000,
    });
    expect(unfinishedTimers(t({ startedAt: ago(5 * MIN) }), NOW).showInMs).toBe(0);
  });
});

describe("copy", () => {
  it("names the platform in the note", () => {
    const text = unfinishedNoteText("Facebook");
    expect(text).toContain("Didn't finish connecting Facebook?");
    expect(text).toContain("ad blocker");
    expect(text).toContain("Facebook's sign-in");
  });

  it("keeps the tips short and free of jargon", () => {
    const tips = connectTroubleTips();
    expect(tips.length).toBeGreaterThanOrEqual(4);
    for (const tip of tips) {
      expect(tip.length).toBeLessThan(120);
      expect(tip.toLowerCase()).not.toContain("zernio");
    }
    expect(tips.join(" ")).toContain("Balanced");
  });
});
