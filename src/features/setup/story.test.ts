import { describe, expect, it } from "vitest";
import {
  careNumbers,
  currentScene,
  READ_TAIL_MS,
  SCENE_MS,
  startStory,
  storyBars,
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
  wanted: true,
  ...over,
});

describe("storyScenes", () => {
  it("plays every scene, reading first while Waggle reads", () => {
    expect(storyScenes(facts({ reading: true }))).toEqual([
      "reading",
      "days",
      "locked",
      "answerable",
      "wanted",
      "summary",
    ]);
    expect(storyScenes(facts())[0]).toBe("days");
  });
  it("skips the locked scene when nobody's DM got locked", () => {
    expect(storyScenes(facts({ locked: 0 }))).not.toContain("locked");
  });
  it("has no locked scene where Meta's rule doesn't apply or DMs weren't read", () => {
    expect(storyScenes(facts({ pastDms: false }))).not.toContain("locked");
    expect(storyScenes(facts({ dmAccessMissing: true }))).not.toContain("locked");
  });
  it("leaves out empty scenes", () => {
    expect(storyScenes(facts({ dmsOpen: 0, commentsOpen: 0, wanted: false, locked: 0 }))).toEqual([
      "days",
      "summary",
    ]);
  });
  it("is only the summary when the account was read before or never read", () => {
    expect(storyScenes(facts({ readBefore: true }))).toEqual(["summary"]);
    expect(storyScenes(facts({ read: false }))).toEqual(["summary"]);
  });
});

describe("the player", () => {
  const scenes: Scene[] = ["reading", "days", "locked", "summary"];
  const tick = (s: StoryState, ms: number, holding = false) =>
    storyStep(s, { type: "tick", ms, scenes, holding });

  it("holds the reading scene while Waggle reads, then moves on after a short tail", () => {
    let s = startStory(scenes, false);
    s = tick(s, 60_000, true);
    expect(s.at).toBe("reading");
    expect(s.elapsed).toBe(0);
    s = tick(s, READ_TAIL_MS);
    expect(s.at).toBe("days");
  });
  it("moves to the next scene after 5 s, and stops at the summary", () => {
    let s = { ...startStory(scenes, false), at: "days" as Scene };
    s = tick(s, SCENE_MS - 100);
    expect(s.at).toBe("days");
    s = tick(s, 100);
    expect(s).toMatchObject({ at: "locked", elapsed: 0 });
    s = tick(tick(s, SCENE_MS), SCENE_MS);
    expect(s.at).toBe("summary");
  });
  it("doesn't move while paused", () => {
    let s = storyStep({ ...startStory(scenes, false), at: "days" }, { type: "toggle" });
    s = tick(s, SCENE_MS * 3);
    expect(s).toMatchObject({ at: "days", elapsed: 0, paused: true });
    s = tick(storyStep(s, { type: "toggle" }), SCENE_MS);
    expect(s.at).toBe("locked");
  });
  it("Skip opens the summary; Watch again plays from the start", () => {
    let s = storyStep(startStory(scenes, false), { type: "skip" });
    expect(s.at).toBe("summary");
    s = storyStep(s, { type: "replay", scenes: ["days", "summary"] });
    expect(s).toEqual({ at: "days", elapsed: 0, paused: false, replayed: true });
  });
  it("can start at the summary (old links)", () => {
    expect(startStory(scenes, true).at).toBe("summary");
  });
  it("keeps going when the list changes under it", () => {
    expect(currentScene(["days", "answerable", "summary"], "locked")).toBe("answerable");
    expect(currentScene(["days", "summary"], "wanted")).toBe("summary");
    // Reading ended and its scene is gone: the next tick lands on days.
    const s = storyStep(startStory(scenes, false), {
      type: "tick",
      ms: 100,
      scenes: ["days", "summary"],
      holding: false,
    });
    expect(s).toMatchObject({ at: "days", elapsed: 100 });
  });
  it("fills the bars: done, current, ahead", () => {
    const s = { ...startStory(scenes, false), at: "days" as Scene, elapsed: SCENE_MS / 2 };
    expect(storyBars(scenes, s, 1)).toEqual([1, 0.5, 0]);
    expect(storyBars(scenes, startStory(scenes, false), 0.3)).toEqual([0.3, 0, 0]);
    expect(storyBars(scenes, { ...s, at: "summary" }, 1)).toEqual([1, 1, 1]);
  });
});

describe("careNumbers", () => {
  it("names the numbers above 0", () => {
    expect(careNumbers([4, 23])).toBe("the 4 and the 23");
    expect(careNumbers([0, 23])).toBe("the 23");
    expect(careNumbers([0, 0])).toBe("");
  });
});
