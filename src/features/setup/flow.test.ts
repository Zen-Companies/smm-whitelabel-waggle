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
  namePending: false,
  wanted: 35,
  lostDms: 37,
  drafted: 20,
  needYou: 7,
  money: 14,
  quick: 6,
};

describe("visibleScreens", () => {
  it("shows every screen with something on it", () => {
    expect(visibleScreens(full)).toEqual(["missed", "money", "quick", "waiting", "how"]);
  });

  it("asks the name first while the brand has none", () => {
    expect(visibleScreens({ ...full, namePending: true })[0]).toBe("name");
  });

  it("skips empty step 3 screens; step 2 and how replies go out always show", () => {
    const empty: FlowFacts = {
      namePending: false,
      wanted: 0,
      lostDms: 0,
      drafted: 0,
      needYou: 0,
      money: 0,
      quick: 0,
    };
    // Step 2 is one screen (its story says what's empty in place).
    expect(visibleScreens(empty)).toEqual(["missed", "how"]);
    // No one waiting: straight to how replies go out.
    expect(visibleScreens({ ...full, needYou: 0 })).not.toContain("waiting");
    expect(visibleScreens({ ...full, money: 0 })).not.toContain("money");
  });
});

describe("openScreen", () => {
  it("opens the first screen by default", () => {
    expect(openScreen({ requested: null, saved: null, facts: full })).toBe("missed");
  });

  it("resumes on the screen left", () => {
    expect(openScreen({ requested: null, saved: "quick", facts: full })).toBe("quick");
  });

  it("a link to a screen wins over the saved one", () => {
    expect(openScreen({ requested: "money", saved: "quick", facts: full })).toBe("money");
  });

  it("step 2's old parts open step 2's one screen", () => {
    expect(openScreen({ requested: "wanted", saved: "quick", facts: full })).toBe("missed");
    expect(openScreen({ requested: null, saved: "replies", facts: full })).toBe("missed");
  });

  it("an empty screen opens the next one with something on it", () => {
    expect(openScreen({ requested: null, saved: "waiting", facts: { ...full, needYou: 0 } })).toBe(
      "how",
    );
    expect(openScreen({ requested: "money", saved: null, facts: { ...full, money: 0 } })).toBe(
      "quick",
    );
  });

  it("asks the name first, whatever was asked", () => {
    const facts = { ...full, namePending: true };
    expect(openScreen({ requested: "how", saved: "quick", facts })).toBe("name");
  });

  it("ignores junk", () => {
    expect(openScreen({ requested: "nope", saved: 3, facts: full })).toBe("missed");
    expect(openScreen({ requested: "name", saved: null, facts: full })).toBe("missed");
  });
});

describe("nextScreen and previousScreen", () => {
  it("walks the visible screens, skipping empty ones", () => {
    const facts = { ...full, quick: 0 };
    expect(nextScreen("missed", facts)).toBe("money");
    expect(nextScreen("money", facts)).toBe("waiting");
    expect(nextScreen("how", facts)).toBeNull();
    expect(nextScreen("name", facts)).toBe("missed");
  });

  it("has no Back on the first screen of a step", () => {
    expect(previousScreen("missed", full)).toBeNull();
    expect(previousScreen("money", full)).toBeNull();
    expect(previousScreen("how", { ...full, needYou: 0 })).toBe("quick");
  });

  it("skips the name question going back", () => {
    expect(previousScreen("missed", { ...full, namePending: true })).toBeNull();
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
    expect(stepPosition("how", { ...full, needYou: 0 })).toEqual({
      step: 3,
      index: 3,
      count: 3,
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
