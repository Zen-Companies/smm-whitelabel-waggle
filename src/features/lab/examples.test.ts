import { describe, expect, it } from "vitest";
import { examplesFromTopics, GENERIC_EXAMPLES } from "./examples";

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
