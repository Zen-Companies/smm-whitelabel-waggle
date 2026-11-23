import { describe, expect, it } from "vitest";
import {
  answerableLine,
  bandDelays,
  currentScene,
  lockedSpamLine,
  READ_TAIL_MS,
  resultsFooter,
  resultTiles,
  showsLocked,
  skipAnswersDefaults,
  startStory,
  storyScenes,
  storyStep,
  type Scene,
  type StoryFacts,
  type StoryState,
} from "./story";

const facts = (over: Partial<StoryFacts> = {}): StoryFacts => ({
  reading: false,
  read: true,
  readBefore: false,
  pastDms: true,
  dmAccessMissing: false,
  locked: 37,
  dmsOpen: 4,
  commentsOpen: 23,
  reviewsOpen: 0,
  replies: 0,
  needYou: 0,
  ...over,
});

describe("storyScenes", () => {
  it("plays the reading first while Waggle reads, then the results", () => {
    expect(storyScenes(facts({ reading: true }))).toEqual(["reading", "results"]);
    expect(storyScenes(facts())).toEqual(["results"]);
  });
  it("is only the results when the account was read before or never read", () => {
    expect(storyScenes(facts({ readBefore: true, reading: true }))).toEqual(["results"]);
    expect(storyScenes(facts({ read: false }))).toEqual(["results"]);
  });
});

describe("the Results card", () => {
  it("has a red band only for Meta platforms with locked DMs it could read", () => {
    expect(showsLocked(facts())).toBe(true);
    expect(showsLocked(facts({ locked: 0 }))).toBe(false);
    expect(showsLocked(facts({ pastDms: false }))).toBe(false);
    expect(showsLocked(facts({ dmAccessMissing: true }))).toBe(false);
  });
  it("counts spam in the red band and says how many looked like spam", () => {
    expect(lockedSpamLine(37, 0)).toBeNull();
    expect(lockedSpamLine(37, 4)).toBe("4 of these looked like spam or a scam.");
    expect(lockedSpamLine(3, 3)).toBe("3 of these looked like spam or a scam.");
    expect(lockedSpamLine(1, 1)).toBe("This one looked like spam or a scam.");
    expect(lockedSpamLine(0, 2)).toBeNull();
  });
  it("says 'But you have Waggle now' only after the red band", () => {
    expect(answerableLine(facts())).toBe("But you have Waggle now. These you can still answer:");
    expect(answerableLine(facts({ locked: 0 }))).toBe("These you can still answer:");
  });
  it("lists the tiles in order, the empty ones left out", () => {
    expect(resultTiles(facts())).toEqual([
      {
        kind: "dms",
        n: 4,
        text: "DMs that close today",
        note: "Answer before Meta locks them",
      },
      { kind: "comments", n: 23, text: "comments with no reply", note: "No time limit on these" },
    ]);
    expect(resultTiles(facts({ dmsOpen: 0, commentsOpen: 1 }))).toEqual([
      { kind: "comments", n: 1, text: "comment with no reply", note: "No time limit on these" },
    ]);
  });
  it("shows reviews (Google Business) and plain open DMs off Meta", () => {
    const google = facts({
      pastDms: false,
      locked: 0,
      dmsOpen: 0,
      commentsOpen: 0,
      reviewsOpen: 6,
    });
    expect(resultTiles(google)).toEqual([
      { kind: "reviews", n: 6, text: "reviews with no reply", note: null },
    ]);
    expect(resultTiles(facts({ pastDms: false, dmsOpen: 2, commentsOpen: 0 }))[0]).toEqual({
      kind: "dms",
      n: 2,
      text: "DMs with no reply",
      note: null,
    });
  });
  it("is empty when nothing is left to answer", () => {
    expect(resultTiles(facts({ dmsOpen: 0, commentsOpen: 0 }))).toEqual([]);
  });
  it("fades the bands in one by one", () => {
    expect(bandDelays(true)).toEqual({ green: 500, chips: 800, ask: 1100 });
    expect(bandDelays(false)).toEqual({ green: 0, chips: 400, ask: 700 });
  });
});

describe("the player", () => {
  const scenes: Scene[] = ["reading", "results"];
  const tick = (s: StoryState, ms: number, holding = false) =>
    storyStep(s, { type: "tick", ms, scenes, holding });

  it("holds the reading while Waggle reads, then shows the results after a short tail", () => {
    let s = startStory(scenes, false);
    s = tick(s, 60_000, true);
    expect(s).toMatchObject({ at: "reading", elapsed: 0 });
    s = tick(s, READ_TAIL_MS - 100);
    expect(s.at).toBe("reading");
    s = tick(s, 100);
    expect(s).toMatchObject({ at: "results", elapsed: 0 });
  });
  it("doesn't move while paused", () => {
    let s = storyStep(startStory(scenes, false), { type: "toggle" });
    s = tick(s, READ_TAIL_MS * 3);
    expect(s).toMatchObject({ at: "reading", paused: true });
    s = tick(storyStep(s, { type: "toggle" }), READ_TAIL_MS);
    expect(s.at).toBe("results");
  });
  it("Skip opens the results", () => {
    expect(storyStep(startStory(scenes, false), { type: "skip" }).at).toBe("results");
  });
  it("can start at the results (old links)", () => {
    expect(startStory(scenes, true).at).toBe("results");
  });
  it("goes to the results when the reading scene is gone", () => {
    expect(currentScene(["results"], "reading")).toBe("results");
    const s = storyStep(startStory(scenes, false), {
      type: "tick",
      ms: 100,
      scenes: ["results"],
      holding: false,
    });
    expect(s.at).toBe("results");
  });
});

describe("resultsFooter", () => {
  const none = { locked: 0, dmsOpen: 0, commentsOpen: 0, reviewsOpen: 0 };
  it("asks when there are customers to answer", () => {
    expect(resultsFooter(facts())).toBe("answer");
  });
  it("asks for Google Business reviews alone", () => {
    expect(resultsFooter(facts({ ...none, pastDms: false, reviewsOpen: 2 }))).toBe("answer");
  });
  it("asks when only locked DMs show but Waggle has replies or people waiting", () => {
    expect(resultsFooter(facts({ ...none, locked: 5, replies: 1 }))).toBe("answer");
    expect(resultsFooter(facts({ ...none, locked: 5, needYou: 1 }))).toBe("answer");
  });
  it("asks when read before but Waggle has replies", () => {
    expect(resultsFooter(facts({ ...none, read: false, readBefore: true, replies: 3 }))).toBe(
      "answer",
    );
  });
  it("offers to set up new messages when there's nothing to answer", () => {
    expect(resultsFooter(facts(none))).toBe("setup");
    expect(resultsFooter(facts({ ...none, locked: 5 }))).toBe("setup");
    expect(resultsFooter(facts({ ...none, read: false, readBefore: true }))).toBe("setup");
    expect(resultsFooter(facts({ ...none, read: false }))).toBe("setup");
  });
});

describe("skipAnswersDefaults", () => {
  it("asks first, refunds and complaints for everyone", () => {
    expect(skipAnswersDefaults(null)).toEqual({ mode: "approve", topics: ["refunds"] });
    expect(skipAnswersDefaults("food")).toEqual({ mode: "approve", topics: ["refunds"] });
  });
  it("adds the kind's safety floor", () => {
    expect(skipAnswersDefaults("health").topics).toEqual(["refunds", "health"]);
    expect(skipAnswersDefaults("services").topics).toEqual(["refunds", "safety", "emergency"]);
  });
  it("never adds the owner's own topics", () => {
    expect(skipAnswersDefaults("services").topics.some((t) => t.startsWith("custom:"))).toBe(false);
  });
});
