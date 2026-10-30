import { describe, expect, it } from "vitest";
import { examplesFromTopics, GENERIC_EXAMPLES } from "./examples";
import { setupComplete, setupSteps } from "./setup";

describe("examplesFromTopics", () => {
  it("turns the business's own topics into customer questions", () => {
    expect(
      examplesFromTopics(["Opening hours", "Pets", "Custom cakes", "Location and parking"]),
    ).toEqual([
      "What time are you open today?",
      "Do you allow dogs?",
      "Do you take custom orders?",
      "Where are you located? Is there parking?",
    ]);
  });

  it("asks about an unknown topic by name, without repeats, up to the limit", () => {
    expect(examplesFromTopics(["Gift cards", "Menu and prices", "Prices"], 5)).toEqual([
      "Can you tell me about your gift cards?",
      "How much is it?",
    ]);
    expect(
      examplesFromTopics(["Hours", "Prices", "Pets", "Wifi", "Refunds", "Delivery"], 3),
    ).toHaveLength(3);
  });

  it("doesn't match words inside other words", () => {
    expect(examplesFromTopics(["Catering", "Delivery times", "Gift cards"])).toEqual([
      "Do you cater events?",
      "Do you deliver?",
      "Can you tell me about your gift cards?",
    ]);
  });

  it("falls back to generic examples without topics", () => {
    expect(examplesFromTopics([])).toEqual(GENERIC_EXAMPLES);
  });
});

describe("setupSteps", () => {
  const fresh = {
    accountsConnected: 1,
    topics: 1,
    hasProfile: false,
    tries: 0,
    daysSinceSignup: 0,
  };

  it("a new business sees what's left, with links", () => {
    const steps = setupSteps(fresh);
    expect(steps.map((s) => s.done)).toEqual([true, false, false, false, false]);
    expect(steps[1]).toMatchObject({
      detail: "1 of 3: hours, prices, how to buy or book",
      action: { href: "/knowledge-base?topic=new" },
    });
    expect(steps[4].detail).toBe("Day 1 of 7 · you check every reply");
    expect(setupComplete(steps)).toBe(false);
  });

  it("is complete after a week with the basics done", () => {
    const steps = setupSteps({
      accountsConnected: 1,
      topics: 5,
      hasProfile: true,
      tries: 4,
      daysSinceSignup: 9,
    });
    expect(setupComplete(steps)).toBe(true);
    expect(steps.every((s) => s.action === null)).toBe(true);
  });
});
