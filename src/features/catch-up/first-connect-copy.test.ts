import { describe, expect, it } from "vitest";
import {
  atHandle,
  breakdownChips,
  draftsLine,
  expiringTitle,
  formatCount,
  missedTitle,
  notCountedLine,
  phaseLine,
  phaseProgress,
  readingCounters,
  revealState,
  stillCounting,
  timeLeft,
  todayCatchUpCopy,
  waitingFor,
} from "./first-connect-copy";
import { parseProgress } from "./progress-schema";
import type { CatchUpProgress, RevealData } from "./reveal-data";

const progress = (over: Partial<CatchUpProgress> = {}): CatchUpProgress => ({
  catchUpId: "c1",
  phase: "reading",
  platform: "instagram",
  handle: "harbourbean",
  commentsFound: 214,
  messagesFound: 63,
  waiting: 37,
  capped: false,
  dmAccessMissing: false,
  ...over,
});

const breakdown = (over: Partial<RevealData["breakdown"]> = {}): RevealData["breakdown"] => ({
  price: 12,
  priceItems: [
    { item: "Winter menu box", count: 6 },
    { item: "Oat latte", count: 5 },
    { item: "Birthday cake", count: 3 },
    { item: "Scone", count: 1 },
  ],
  booking: 8,
  hours: 5,
  otherQuestions: 0,
  complaints: 3,
  reviewsUnanswered: 2,
  ...over,
});

const reveal = (over: Partial<RevealData> = {}): RevealData => ({
  progress: progress({ phase: "ready" }),
  waiting: 37,
  breakdown: breakdown(),
  notCounted: { praiseAndTags: 41, spam: 9 },
  longestWait: null,
  expiringToday: [],
  draftsReady: 20,
  missed: 19,
  ...over,
});

describe("formatCount", () => {
  it("shows plain numbers", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(214)).toBe("214");
    expect(formatCount(500)).toBe("500");
  });
  it("reads 500+ above the sort cap", () => {
    expect(formatCount(501)).toBe("500+");
    expect(formatCount(1000, { capped: true, sorted: true })).toBe("500+");
  });
  it("marks a sorted count as a floor when capped", () => {
    expect(formatCount(37, { capped: true, sorted: true })).toBe("37+");
    expect(formatCount(37, { capped: true })).toBe("37");
  });
});

describe("atHandle", () => {
  it("adds one @", () => {
    expect(atHandle("harbourbean", "Instagram")).toBe("@harbourbean");
    expect(atHandle("@harbourbean", "Instagram")).toBe("@harbourbean");
  });
  it("keeps a page name with spaces and falls back to the platform", () => {
    expect(atHandle("Harbour Bean Café", "Facebook")).toBe("Harbour Bean Café");
    expect(atHandle(null, "Instagram")).toBe("your Instagram");
    expect(atHandle("  ", "Facebook")).toBe("your Facebook");
  });
});

describe("phases", () => {
  it("fills the bar as it goes", () => {
    expect(phaseProgress("reading")).toBeLessThan(phaseProgress("sorting"));
    expect(phaseProgress("sorting")).toBeLessThan(phaseProgress("drafting"));
    expect(phaseProgress("ready")).toBe(100);
  });
  it("says reviews only for Facebook", () => {
    expect(phaseLine("reading", "facebook")).toBe(
      "Reading comments · then messages · then reviews",
    );
    expect(phaseLine("reading", "instagram")).toBe("Reading comments · then messages");
  });
  it("keeps counting found items while reading, waiting until sorted", () => {
    expect(stillCounting("reading", "found")).toBe(true);
    expect(stillCounting("sorting", "found")).toBe(false);
    expect(stillCounting("sorting", "waiting")).toBe(true);
    expect(stillCounting("drafting", "waiting")).toBe(false);
  });
});

describe("readingCounters", () => {
  it("shows the three counters with still counting while reading", () => {
    const c = readingCounters(progress());
    expect(c.map((x) => x.value)).toEqual(["214", "63", "37"]);
    expect(c.every((x) => x.note === "still counting…")).toBe(true);
  });
  it("never says 0 messages when Waggle can't see them", () => {
    const c = readingCounters(progress({ dmAccessMissing: true, messagesFound: 0 }));
    expect(c[1].value).toBe("—");
    expect(c[1].note).toBe("Waggle can’t see them yet");
  });
  it("drops the note when done and marks capped waiting", () => {
    const c = readingCounters(progress({ phase: "ready", capped: true, commentsFound: 900 }));
    expect(c[0]).toMatchObject({ value: "500+", note: null });
    expect(c[2]).toMatchObject({ value: "37+", note: null });
  });
});

describe("breakdownChips", () => {
  it("matches the board, three items at most", () => {
    expect(breakdownChips(breakdown())).toEqual([
      "12 asked about price (winter menu box, oat latte, birthday cake)",
      "8 ready to book",
      "5 about hours",
      "3 complaints",
      "2 reviews with no reply",
    ]);
  });
  it("leaves out zeros and items when asked", () => {
    expect(
      breakdownChips(
        breakdown({ price: 0, complaints: 1, reviewsUnanswered: 1, otherQuestions: 1 }),
        false,
      ),
    ).toEqual([
      "8 ready to book",
      "5 about hours",
      "1 other question",
      "1 complaint",
      "1 review with no reply",
    ]);
    expect(breakdownChips(breakdown({ priceItems: [] }))[0]).toBe("12 asked about price");
  });
});

describe("notCountedLine", () => {
  it("lists what was left out", () => {
    expect(notCountedLine({ praiseAndTags: 41, spam: 9 })).toBe(
      "Not counted: 41 nice comments and friend tags, 9 spam.",
    );
    expect(notCountedLine({ praiseAndTags: 0, spam: 2 })).toBe("Not counted: 2 spam.");
    expect(notCountedLine({ praiseAndTags: 0, spam: 0 })).toBe("");
  });
});

describe("waits and countdowns", () => {
  it("says how long a comment waited", () => {
    expect(waitingFor(9.4)).toBe("has been waiting 9 days");
    expect(waitingFor(1)).toBe("has been waiting 1 day");
    expect(waitingFor(0.3)).toBe("has been waiting since today");
  });
  it("counts down in hours, then minutes, then nothing", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(timeLeft("2026-11-20T13:20:00Z", now)).toBe("3 h left");
    expect(timeLeft("2026-11-20T10:40:00Z", now)).toBe("40 min left");
    expect(timeLeft("2026-11-20T10:00:20Z", now)).toBe("1 min left");
    expect(timeLeft("2026-11-20T09:59:00Z", now)).toBeNull();
    expect(timeLeft("not a date", now)).toBeNull();
  });
  it("names the counts", () => {
    expect(expiringTitle(4)).toBe("4 of these expire today");
    expect(expiringTitle(1)).toBe("1 of these expires today");
    expect(missedTitle(19)).toBe("19 older messages · missed");
    expect(missedTitle(1)).toBe("1 older message · missed");
    expect(draftsLine(20)).toBe("20 drafts ready · one tap each · nothing is sent without you");
  });
});

describe("revealState", () => {
  it("has nothing before a catch-up", () => {
    expect(revealState(null, 3)).toBe("none");
  });
  it("shows the counters until ready", () => {
    expect(revealState(reveal({ progress: progress({ phase: "drafting" }) }), 3)).toBe("reading");
  });
  it("is all caught up when nobody waited (never 0 missed)", () => {
    expect(revealState(reveal({ waiting: 0, draftsReady: 0 }), 3)).toBe("quiet");
  });
  it("asks for an answer when nothing could be drafted and none are written", () => {
    expect(revealState(reveal({ draftsReady: 0 }), 0)).toBe("no-answers");
    expect(revealState(reveal({ draftsReady: 0 }), 2)).toBe("full");
  });
  it("is the full reveal otherwise", () => {
    expect(revealState(reveal(), 3)).toBe("full");
  });
});

describe("todayCatchUpCopy", () => {
  it("says it's catching up while reading", () => {
    expect(
      todayCatchUpCopy({ phase: "sorting", handle: "@x", waiting: 0, draftsReady: 0 }).title,
    ).toBe("Waggle is catching up on @x");
  });
  it("is the board's way back when ready", () => {
    expect(
      todayCatchUpCopy({ phase: "ready", handle: "@x", waiting: 37, draftsReady: 20 }),
    ).toEqual({
      title: "Your inbox catch-up is ready",
      line: "You left while Waggle was reading. 37 customers waited; 20 replies are drafted.",
      link: "See what you missed",
    });
    expect(
      todayCatchUpCopy({ phase: "ready", handle: "@x", waiting: 1, draftsReady: 1 }).line,
    ).toBe("You left while Waggle was reading. 1 customer waited; 1 reply is drafted.");
  });
});

describe("parseProgress", () => {
  it("accepts the contract and rejects anything else", () => {
    expect(parseProgress(progress())).toEqual(progress());
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress({ error: "not found" })).toBeNull();
    expect(parseProgress({ ...progress(), phase: "done" })).toBeNull();
  });

  it("carries the optional top questions flags (busy accounts)", () => {
    const p = progress({ topQuestionsReady: true, topQuestionsDone: false });
    expect(parseProgress(p)).toEqual(p);
    expect(parseProgress({ ...progress(), topQuestionsReady: "yes" })).toBeNull();
  });
});
