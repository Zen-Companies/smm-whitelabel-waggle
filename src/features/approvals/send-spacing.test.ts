import { describe, expect, it } from "vitest";
import {
  nextSendSlot,
  SEND_SPACING_MS,
  sendingProgress,
  SENDING_ROUND_GAP_MS,
  spacingWaitMs,
} from "./send-spacing";

const S = SEND_SPACING_MS;

describe("nextSendSlot", () => {
  it("is the earliest moment when nothing else is booked", () => {
    expect(nextSendSlot(1_000, [], S)).toBe(1_000);
  });

  it("books after the last reply when approvals come fast", () => {
    // 20 approvals a second apart: each lands SEND_SPACING_MS after the one before.
    const taken: number[] = [];
    for (let i = 0; i < 20; i++) taken.push(nextSendSlot(8_000 + i * 1_000, taken, S));
    expect(taken[0]).toBe(8_000);
    for (let i = 1; i < taken.length; i++) expect(taken[i]! - taken[i - 1]!).toBe(S);
  });

  it("never books earlier than the earliest moment (the undo window)", () => {
    expect(nextSendSlot(50_000, [0, 10_000], S)).toBe(50_000);
  });

  it("fills a gap between bookings when there is room", () => {
    // A reply held back for minutes (a retry) doesn't push a new one after it.
    expect(nextSendSlot(10_000, [300_000], S)).toBe(10_000);
    expect(nextSendSlot(10_000, [0, 100_000], S)).toBe(25_000);
  });

  it("skips gaps too small for a reply", () => {
    expect(nextSendSlot(10_000, [0, 40_000, 70_000], S)).toBe(95_000);
  });

  it("keeps every booking at least the spacing apart, in any order", () => {
    const slot = nextSendSlot(0, [60_000, 20_000, 5_000], S);
    for (const t of [60_000, 20_000, 5_000]) expect(Math.abs(slot - t)).toBeGreaterThanOrEqual(S);
  });

  it("does nothing with spacing off", () => {
    expect(nextSendSlot(10_000, [10_000], 0)).toBe(10_000);
  });
});

describe("spacingWaitMs", () => {
  it("waits out the rest of the spacing after the account's last send", () => {
    expect(spacingWaitMs(110_000, 100_000, S)).toBe(15_000);
  });
  it("goes now when the last send was long enough ago, or there wasn't one", () => {
    expect(spacingWaitMs(200_000, 100_000, S)).toBe(0);
    expect(spacingWaitMs(200_000, null, S)).toBe(0);
  });
});

describe("sendingProgress", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 10, 20, 9, 0, s)).toISOString();

  it("counts the round: sent ones and the ones still waiting their turn", () => {
    const rows = [
      ...Array.from({ length: 2 }, (_, i) => ({ decidedAt: at(i), sent: true })),
      ...Array.from({ length: 18 }, (_, i) => ({ decidedAt: at(2 + i), sent: false })),
    ];
    expect(sendingProgress(rows)).toEqual({ current: 3, total: 20, sent: 2, queued: 18 });
  });

  it("is null when nothing is waiting", () => {
    expect(sendingProgress([{ decidedAt: at(0), sent: true }])).toBeNull();
    expect(sendingProgress([])).toBeNull();
  });

  it("is null for a single reply (the Sent row covers it)", () => {
    expect(sendingProgress([{ decidedAt: at(0), sent: false }])).toBeNull();
  });

  it("leaves out replies sent in an earlier round", () => {
    const old = new Date(Date.parse(at(0)) - SENDING_ROUND_GAP_MS - 60_000).toISOString();
    const rows = [
      { decidedAt: old, sent: true },
      { decidedAt: at(0), sent: true },
      { decidedAt: at(5), sent: false },
      { decidedAt: at(6), sent: false },
    ];
    expect(sendingProgress(rows)).toEqual({ current: 2, total: 3, sent: 1, queued: 2 });
  });

  it("never says more than the total", () => {
    const rows = [
      { decidedAt: at(0), sent: true },
      { decidedAt: at(1), sent: true },
      { decidedAt: at(2), sent: false },
    ];
    expect(sendingProgress(rows)?.current).toBe(3);
  });
});
