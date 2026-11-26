import { describe, expect, it } from "vitest";
import {
  bannerCountdown,
  countdownOf,
  inboxCountdown,
  lockLine,
  openDmsFrom,
  popupCountdown,
  timeLeft,
  type OpenDm,
} from "./dm-countdown";
import { PLANS } from "./plans";
import { NO_FACTS, popupContent, type PopupVersion, type Seg } from "./popup-copy";

const NOW = new Date("2026-11-26T12:00:00Z");
const H = 3_600_000;
const MIN = 60_000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const dm = (ms: number, platform = "instagram"): OpenDm => ({ closesAt: at(ms), platform });
const text = (segs: Seg[] | null | undefined) => (segs ? segs.map((s) => s.text).join("") : null);

describe("countdownOf", () => {
  it("is null when there are no open DMs (no box, nothing invented)", () => {
    expect(countdownOf([], NOW)).toBeNull();
  });

  it("leaves out closed windows and ones closing after 24 hours", () => {
    expect(countdownOf([dm(-MIN), dm(-5 * H)], NOW)).toBeNull();
    expect(countdownOf([dm(30 * H, "tiktok")], NOW)).toBeNull();
    const c = countdownOf([dm(-MIN), dm(5 * H), dm(30 * H, "tiktok"), dm(3 * H)], NOW)!;
    expect(c.count).toBe(2);
  });

  it("takes the nearest close time, whatever the order", () => {
    const c = countdownOf([dm(14 * H), dm(3 * H + 20 * MIN), dm(9 * H, "facebook")], NOW)!;
    expect(c.nearestMs).toBe(3 * H + 20 * MIN);
    expect(c.nearestPlatform).toBe("instagram");
    expect(c.platforms.sort()).toEqual(["facebook", "instagram"]);
  });

  it("is red under 1 hour only", () => {
    expect(countdownOf([dm(59 * MIN)], NOW)!.urgent).toBe(true);
    expect(countdownOf([dm(H)], NOW)!.urgent).toBe(false);
    expect(countdownOf([dm(3 * H)], NOW)!.urgent).toBe(false);
  });

  it("never resets: the same close times give less time a minute later", () => {
    const dms = [dm(45 * MIN)];
    const later = new Date(NOW.getTime() + 10 * MIN);
    expect(countdownOf(dms, NOW)!.nearestMs).toBe(45 * MIN);
    expect(countdownOf(dms, later)!.nearestMs).toBe(35 * MIN);
    expect(countdownOf(dms, new Date(NOW.getTime() + 46 * MIN))).toBeNull();
  });

  it("says today only when every one closes before the day ends", () => {
    const endOfDay = new Date(NOW.getTime() + 6 * H);
    expect(countdownOf([dm(3 * H), dm(5 * H)], NOW, endOfDay)!.allToday).toBe(true);
    expect(countdownOf([dm(3 * H), dm(8 * H)], NOW, endOfDay)!.allToday).toBe(false);
    expect(countdownOf([dm(3 * H)], NOW)!.allToday).toBe(false);
  });
});

describe("timeLeft", () => {
  it("rounds down to whole hours, then minutes", () => {
    expect(timeLeft(3 * H + 59 * MIN)).toBe("3 h");
    expect(timeLeft(H)).toBe("1 h");
    expect(timeLeft(45 * MIN + 30_000)).toBe("45 min");
    expect(timeLeft(MIN)).toBe("1 min");
    expect(timeLeft(30_000)).toBe("under 1 min");
  });
});

describe("lockLine", () => {
  const line = (dms: OpenDm[]) => lockLine(countdownOf(dms, NOW)!);
  it("names Meta's 24 hours for Instagram, Facebook and WhatsApp", () => {
    expect(line([dm(3 * H), dm(5 * H, "facebook"), dm(6 * H, "whatsapp")])).toBe(
      "Meta locks them after 24 hours.",
    );
    expect(line([dm(3 * H)])).toBe("Meta locks it after 24 hours.");
  });

  it("names TikTok's 48 hours when they're all TikTok", () => {
    expect(line([dm(3 * H, "tiktok"), dm(4 * H, "tiktok")])).toBe(
      "TikTok locks them after 48 hours.",
    );
  });

  it("mixed: the nearest one's platform says it; any other window is neutral", () => {
    expect(line([dm(2 * H), dm(5 * H, "tiktok")])).toBe("Meta locks them after 24 hours.");
    expect(line([dm(2 * H, "tiktok"), dm(5 * H)])).toBe("TikTok locks them after 48 hours.");
    expect(line([dm(2 * H, "rcs"), dm(5 * H)])).toBe("After that, you can’t reply.");
  });
});

describe("popupCountdown", () => {
  const c4 = countdownOf([dm(3 * H), dm(5 * H), dm(9 * H, "facebook"), dm(14 * H)], NOW);
  const c1 = countdownOf([dm(45 * MIN)], NOW);

  it("B and F: Walter's line, word for word", () => {
    for (const v of [
      { v: "worker_bee", topic: null },
      { v: "worker_bee", topic: "faq" },
      { v: "try", sub: "banner" },
      { v: "try", sub: "welcome" },
    ] as PopupVersion[]) {
      expect(text(popupCountdown(v, c4, "Solo")!.segs)).toBe(
        "4 DMs close in 3 h. Meta locks them after 24 hours. Worker Bee would answer them now.",
      );
    }
  });

  it("singular: 1 DM closes, locks it, answer it; red under an hour", () => {
    const box = popupCountdown({ v: "try", sub: "banner" }, c1, "Solo")!;
    expect(text(box.segs)).toBe(
      "1 DM closes in 45 min. Meta locks it after 24 hours. Worker Bee would answer it now.",
    );
    expect(box.urgent).toBe(true);
    expect(box.segs[0]).toEqual({ text: "1 DM closes in 45 min", bold: true });
  });

  it("C (out and running low): With Solo, Waggle answers them now", () => {
    for (const level of ["out", "low"] as const) {
      expect(text(popupCountdown({ v: "replies", level }, c4, "Solo")!.segs)).toBe(
        "4 DMs close in 3 h. With Solo, Waggle answers them now.",
      );
    }
    expect(text(popupCountdown({ v: "replies", level: "out" }, c1, "Solo")!.segs)).toBe(
      "1 DM closes in 45 min. With Solo, Waggle answers it now.",
    );
  });

  it("is hidden when none, and in the other versions", () => {
    expect(popupCountdown({ v: "try", sub: "banner" }, null, "Solo")).toBeNull();
    for (const v of [
      { v: "accounts", platform: "tiktok" },
      { v: "accounts_pick", picked: ["instagram", "tiktok"] },
      { v: "idle", platform: "instagram" },
      { v: "team", sub: "invite" },
    ] as PopupVersion[]) {
      expect(popupCountdown(v, c4, "Solo")).toBeNull();
    }
  });

  it("is in the pop-up's content from its facts, and absent without open DMs", () => {
    const make = (openDms: OpenDm[]) =>
      popupContent({
        version: { v: "try", sub: "banner" },
        plans: PLANS,
        trial: true,
        facts: { ...NO_FACTS, openDms },
        now: NOW,
      });
    expect(text(make([dm(3 * H), dm(4 * H)]).countdown?.segs)).toBe(
      "2 DMs close in 3 h. Meta locks them after 24 hours. Worker Bee would answer them now.",
    );
    expect(make([]).countdown).toBeNull();
    expect(make([dm(-H)]).countdown).toBeNull();
  });
});

describe("banner and Inbox lines", () => {
  const endOfDay = new Date(NOW.getTime() + 12 * H);
  const two = countdownOf([dm(3 * H), dm(5 * H)], NOW, endOfDay)!;
  const one = countdownOf([dm(45 * MIN)], NOW, endOfDay)!;
  const late = countdownOf([dm(3 * H), dm(20 * H)], NOW, endOfDay)!;

  it("Today's Try Solo banner", () => {
    expect(bannerCountdown(two)).toBe("2 DMs close today, the first in 3 h");
    expect(bannerCountdown(one)).toBe("1 DM closes today, in 45 min");
    expect(bannerCountdown(late)).toBe("2 DMs close within a day, the first in 3 h");
  });

  it("the Inbox: Free gets the way to Worker Bee, paid the plain clock", () => {
    expect(inboxCountdown(two, true)).toBe("2 DMs close today. Worker Bee would answer them now.");
    expect(inboxCountdown(one, true)).toBe("1 DM closes today. Worker Bee would answer it now.");
    expect(inboxCountdown(two, false)).toBe("2 DMs close today · 3 h left on the first");
    expect(inboxCountdown(one, false)).toBe("1 DM closes today · 45 min left to reply");
  });
});

describe("openDmsFrom", () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  it("uses the platform's window from the customer's last message, nearest first", () => {
    expect(
      openDmsFrom(
        [
          { conversationId: "a", platform: "instagram", lastCustomerMessageAt: ago(10 * H) },
          { conversationId: "b", platform: "tiktok", lastCustomerMessageAt: ago(40 * H) },
          { conversationId: "c", platform: "facebook", lastCustomerMessageAt: ago(23 * H) },
        ],
        NOW,
      ),
    ).toEqual([
      { closesAt: at(H), platform: "facebook" },
      { closesAt: at(8 * H), platform: "tiktok" },
      { closesAt: at(14 * H), platform: "instagram" },
    ]);
  });

  it("leaves out closed windows, platforms without one and unknown times", () => {
    expect(
      openDmsFrom(
        [
          { conversationId: "a", platform: "instagram", lastCustomerMessageAt: ago(25 * H) },
          { conversationId: "b", platform: "bluesky", lastCustomerMessageAt: ago(H) },
          { conversationId: "c", platform: "instagram", lastCustomerMessageAt: null },
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("counts a conversation once, and reads a missing account as Instagram (like the Inbox)", () => {
    const rows = [
      { conversationId: "a", platform: null, lastCustomerMessageAt: ago(2 * H) },
      { conversationId: "a", platform: null, lastCustomerMessageAt: ago(2 * H) },
    ];
    expect(openDmsFrom(rows, NOW)).toEqual([{ closesAt: at(22 * H), platform: "instagram" }]);
  });
});
