import { describe, expect, it } from "vitest";
import { backoffDelayMs, createDeadline } from "./index";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("createDeadline (60 s run, claim until 45 s, 20 s per item)", () => {
  it("claims and starts items early in the run", () => {
    const c = clock();
    const d = createDeadline({ now: c.now });
    expect(d.canClaim()).toBe(true);
    expect(d.canStartItem()).toBe(true);
    expect(d.remainingMs()).toBe(60_000);
  });

  it("stops starting items once less than 20 s remain", () => {
    const c = clock();
    const d = createDeadline({ now: c.now });
    c.advance(40_000);
    expect(d.canStartItem()).toBe(true);
    c.advance(1);
    expect(d.canStartItem()).toBe(false);
    expect(d.canClaim()).toBe(false);
  });

  it("never claims after 45 s even with a longer max", () => {
    const c = clock();
    const d = createDeadline({ now: c.now, maxMs: 300_000 });
    c.advance(44_999);
    expect(d.canClaim()).toBe(true);
    c.advance(1);
    expect(d.canClaim()).toBe(false);
    expect(d.canStartItem()).toBe(true);
  });

  it("remaining time never goes negative", () => {
    const c = clock();
    const d = createDeadline({ now: c.now });
    c.advance(90_000);
    expect(d.remainingMs()).toBe(0);
  });
});

describe("backoffDelayMs", () => {
  it("is 2^attempts minutes", () => {
    expect(backoffDelayMs(1)).toBe(2 * 60_000);
    expect(backoffDelayMs(2)).toBe(4 * 60_000);
    expect(backoffDelayMs(3)).toBe(8 * 60_000);
  });
});
