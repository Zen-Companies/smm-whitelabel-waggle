import { describe, expect, it } from "vitest";
import { continueHref, nextReadyStep, readyDone, readySteps } from "./checklist";

const fresh = { hasProfile: false, accounts: 0, answers: 0, tries: 0, repliesChosen: false };

describe("readySteps", () => {
  it("lists the same five steps in setup order", () => {
    const steps = readySteps(fresh);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(steps.map((s) => s.label)).toEqual([
      "Your business",
      "Connect",
      "Top answers",
      "Try 3 messages",
      "How replies go out",
    ]);
    expect(steps.every((s) => s.status === "Not yet" && s.state === "off")).toBe(true);
    expect(readyDone(steps)).toBe(0);
  });

  it("counts partial answers and tries", () => {
    const steps = readySteps({ ...fresh, answers: 2, tries: 1 });
    expect(steps[2]).toMatchObject({ done: false, status: "2 of 3", state: "waiting" });
    expect(steps[3]).toMatchObject({ done: false, status: "1 of 3", state: "waiting" });
  });

  it("is done when every fact is there", () => {
    const steps = readySteps({
      hasProfile: true,
      accounts: 1,
      answers: 5,
      tries: 3,
      repliesChosen: true,
    });
    expect(readyDone(steps)).toBe(5);
    expect(nextReadyStep(steps)).toBeNull();
    expect(continueHref(steps)).toBe("/today");
  });
});

describe("continueHref", () => {
  it("goes back into setup at the first step not done", () => {
    const steps = readySteps({ ...fresh, hasProfile: true, accounts: 2, answers: 3 });
    expect(nextReadyStep(steps)?.label).toBe("Try 3 messages");
    expect(continueHref(steps)).toBe("/setup?step=4");
  });
});
