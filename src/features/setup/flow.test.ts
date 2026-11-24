import { describe, expect, it } from "vitest";
import {
  currentStep,
  nextScreen,
  openScreen,
  previousScreen,
  setupEntry,
  stepPosition,
  stepsDone,
  visibleScreens,
  type FlowFacts,
} from "./flow";

const full: FlowFacts = {
  wanted: 35,
  lostDms: 37,
  drafted: 20,
  needYou: 7,
  money: 14,
  quick: 6,
};

describe("visibleScreens", () => {
  it("is step 2's story, then step 3's chat", () => {
    expect(visibleScreens(full)).toEqual(["missed", "chat"]);
  });

  it("never shows the old name screen (the name is confirmed in step 3, 24 Nov)", () => {
    expect(visibleScreens(full)).not.toContain("name");
  });

  it("shows both screens even when empty (each says so in place)", () => {
    const empty: FlowFacts = {
      wanted: 0,
      lostDms: 0,
      drafted: 0,
      needYou: 0,
      money: 0,
      quick: 0,
    };
    expect(visibleScreens(empty)).toEqual(["missed", "chat"]);
  });
});

describe("openScreen", () => {
  it("opens the first screen by default", () => {
    expect(openScreen({ requested: null, saved: null, facts: full })).toBe("missed");
  });

  it("resumes on the screen left", () => {
    expect(openScreen({ requested: null, saved: "chat", facts: full })).toBe("chat");
  });

  it("a link to a screen wins over the saved one", () => {
    expect(openScreen({ requested: "missed", saved: "chat", facts: full })).toBe("missed");
  });

  it("old screens open where they live now", () => {
    expect(openScreen({ requested: "wanted", saved: "quick", facts: full })).toBe("missed");
    expect(openScreen({ requested: null, saved: "replies", facts: full })).toBe("missed");
    for (const old of ["money", "quick", "waiting", "how"]) {
      expect(openScreen({ requested: old, saved: null, facts: full })).toBe("chat");
      expect(openScreen({ requested: null, saved: old, facts: full })).toBe("chat");
    }
  });

  it("an old link or saved screen 'name' opens step 2's results", () => {
    expect(openScreen({ requested: "name", saved: "chat", facts: full })).toBe("missed");
    expect(openScreen({ requested: null, saved: "name", facts: full })).toBe("missed");
    expect(openScreen({ requested: "how", saved: "name", facts: full })).toBe("chat");
  });

  it("ignores junk", () => {
    expect(openScreen({ requested: "nope", saved: 3, facts: full })).toBe("missed");
    expect(openScreen({ requested: "name", saved: null, facts: full })).toBe("missed");
  });
});

describe("nextScreen and previousScreen", () => {
  it("goes from the story to the chat, then setup is done", () => {
    expect(nextScreen("missed", full)).toBe("chat");
    expect(nextScreen("chat", full)).toBeNull();
    expect(nextScreen("name", full)).toBe("missed");
  });

  it("has no Back on the first screen of a step", () => {
    expect(previousScreen("missed", full)).toBeNull();
    expect(previousScreen("chat", full)).toBeNull();
  });
});

describe("stepPosition", () => {
  it("counts the screens of the step that show", () => {
    expect(stepPosition("missed", full)).toEqual({
      step: 2,
      index: 1,
      count: 1,
      sublabel: "What you missed",
    });
    expect(stepPosition("chat", full)).toEqual({
      step: 3,
      index: 1,
      count: 1,
      sublabel: "Waggle’s answers",
    });
  });
});

describe("stepsDone and currentStep", () => {
  it("is Connect until an account is connected", () => {
    const done = stepsDone({ connected: false, saved: null, finished: false });
    expect(done).toEqual([false, false, false]);
    expect(currentStep(done)).toBe(1);
  });

  it("step 2 is done once the owner reached step 3", () => {
    expect(stepsDone({ connected: true, saved: "replies", finished: false })).toEqual([
      true,
      false,
      false,
    ]);
    const done = stepsDone({ connected: true, saved: "money", finished: false });
    expect(done).toEqual([true, true, false]);
    expect(currentStep(done)).toBe(3);
  });

  it("all done once finished", () => {
    const done = stepsDone({ connected: false, saved: null, finished: true });
    expect(done).toEqual([true, true, true]);
    expect(currentStep(done)).toBeNull();
  });
});

describe("setupEntry", () => {
  it("is Connect until something is connected or connecting", () => {
    expect(setupEntry({ connected: false, connecting: false })).toBe("welcome");
    expect(setupEntry({ connected: false, connecting: true })).toBe("setup");
    expect(setupEntry({ connected: true, connecting: false })).toBe("setup");
  });
});
