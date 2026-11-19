import { describe, expect, it } from "vitest";
import {
  EARLY_AFTER_MS,
  EARLY_MIN_QUESTIONS,
  GENERIC_AFTER_MS,
  normalizeQuestion,
  questionsWaitView,
  refreshKey,
  topQuestionsPass,
  unansweredTopQuestions,
  WAIT_GIVE_UP_MS,
  waitingForTopQuestions,
} from "./busy-rules";

const start = new Date("2026-11-20T10:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);
const base = {
  questionsSorted: 0,
  startedAt: start,
  now: start,
  sortedAt: null,
  topQuestionsAt: null,
  finalAt: null,
};

describe("topQuestionsPass", () => {
  it("waits while too few questions are sorted and it's early", () => {
    expect(topQuestionsPass({ ...base, questionsSorted: 49, now: at(60_000) })).toBeNull();
  });

  it("builds early at 50 sorted questions, even in the first minute", () => {
    expect(topQuestionsPass({ ...base, questionsSorted: EARLY_MIN_QUESTIONS })).toBe("early");
  });

  it("builds early after 2 minutes with at least one sorted question", () => {
    expect(topQuestionsPass({ ...base, questionsSorted: 1, now: at(EARLY_AFTER_MS) })).toBe(
      "early",
    );
    expect(topQuestionsPass({ ...base, questionsSorted: 1, now: at(EARLY_AFTER_MS - 1) })).toBe(
      null,
    );
  });

  it("never builds early with no sorted question, however long it's been", () => {
    expect(topQuestionsPass({ ...base, questionsSorted: 0, now: at(30 * 60_000) })).toBeNull();
  });

  it("builds early only once", () => {
    expect(
      topQuestionsPass({ ...base, questionsSorted: 400, topQuestionsAt: at(1000).toISOString() }),
    ).toBeNull();
  });

  it("builds the final once sorting is done, early or not", () => {
    const sortedAt = at(600_000).toISOString();
    expect(topQuestionsPass({ ...base, sortedAt })).toBe("final");
    expect(topQuestionsPass({ ...base, sortedAt, topQuestionsAt: at(1000).toISOString() })).toBe(
      "final",
    );
  });

  it("never runs a third time", () => {
    const t = at(600_000).toISOString();
    expect(
      topQuestionsPass({
        ...base,
        questionsSorted: 500,
        sortedAt: t,
        topQuestionsAt: t,
        finalAt: t,
      }),
    ).toBeNull();
  });
});

describe("waitingForTopQuestions", () => {
  const w = { hasCatchUp: true, finalAt: null, cached: 0, startedAt: start, now: at(60_000) };
  it("waits while the catch-up is still working and nothing is cached", () => {
    expect(waitingForTopQuestions(w)).toBe(true);
  });
  it("doesn't wait without a catch-up, once final, or once some are cached", () => {
    expect(waitingForTopQuestions({ ...w, hasCatchUp: false })).toBe(false);
    expect(waitingForTopQuestions({ ...w, finalAt: at(1).toISOString() })).toBe(false);
    expect(waitingForTopQuestions({ ...w, cached: 2 })).toBe(false);
  });
  it("gives up on a catch-up that stalled for an hour", () => {
    expect(waitingForTopQuestions({ ...w, now: at(WAIT_GIVE_UP_MS) })).toBe(false);
  });
});

describe("questionsWaitView", () => {
  it("shows only the waiting card for the first minute", () => {
    expect(questionsWaitView({ waiting: true, ready: false, elapsedMs: 0 })).toBe("waiting");
    expect(
      questionsWaitView({ waiting: true, ready: false, elapsedMs: GENERIC_AFTER_MS - 1 }),
    ).toBe("waiting");
  });
  it("adds the usual questions after a minute", () => {
    expect(questionsWaitView({ waiting: true, ready: false, elapsedMs: GENERIC_AFTER_MS })).toBe(
      "waiting-with-questions",
    );
  });
  it("is the usual step when not waiting or once ready", () => {
    expect(questionsWaitView({ waiting: false, ready: false, elapsedMs: 0 })).toBe("none");
    expect(questionsWaitView({ waiting: true, ready: true, elapsedMs: 0 })).toBe("none");
  });
});

describe("refreshKey", () => {
  it("asks for a refresh once questions are ready or the catch-up is done", () => {
    expect(refreshKey({})).toBeNull();
    expect(refreshKey({ topQuestionsReady: false, topQuestionsDone: false })).toBeNull();
    expect(refreshKey({ topQuestionsReady: true })).toBe("ready");
    expect(refreshKey({ topQuestionsDone: true })).toBe("done");
    expect(refreshKey({ topQuestionsReady: true, topQuestionsDone: true })).toBe("ready");
  });
});

describe("unansweredTopQuestions", () => {
  const top = [
    { question: "Are you open on Sundays?", count: 3 },
    { question: "How much is it?", count: 9 },
    { question: "Do you deliver?", count: 5 },
    { question: "Is there parking?", count: 1 },
  ];
  it("keeps the top 3 the knowledge base doesn't answer, most asked first", () => {
    expect(unansweredTopQuestions(top, []).map((q) => q.question)).toEqual([
      "How much is it?",
      "Do you deliver?",
      "Are you open on Sundays?",
    ]);
  });
  it("matches answers by question, ignoring case, spaces and ending punctuation", () => {
    expect(
      unansweredTopQuestions(top, ["how much  is it", "Do you deliver?"]).map((q) => q.question),
    ).toEqual(["Are you open on Sundays?"]);
  });
  it("is empty once the top 3 are answered (the 4th doesn't count)", () => {
    expect(
      unansweredTopQuestions(top, [
        "How much is it?",
        "Do you deliver?",
        "Are you open on Sundays?",
      ]),
    ).toEqual([]);
  });
});

describe("normalizeQuestion", () => {
  it("collapses spaces, lowercases and drops ending punctuation", () => {
    expect(normalizeQuestion("  How   much is it?! ")).toBe("how much is it");
  });
});
