import { describe, expect, it } from "vitest";
import {
  askFirstMatch,
  askFirstTopicsFor,
  isAskFirstId,
  customLabel,
  customTopic,
  isCustomTopic,
} from "./ask-first";

describe("askFirstTopicsFor", () => {
  it("starts with refunds and complaints, on", () => {
    for (const kind of [null, "food", "beauty", "shop", "other"]) {
      expect(askFirstTopicsFor(kind)[0]).toEqual({
        id: "refunds",
        label: "Refunds and complaints",
        on: true,
      });
    }
  });

  it("adds allergies for food and health for salons and gyms", () => {
    expect(askFirstTopicsFor("food").map((t) => [t.id, t.on])).toEqual([
      ["refunds", true],
      ["allergies", true],
      ["discounts", false],
      ["big_orders", false],
    ]);
    expect(askFirstTopicsFor("beauty")[1]).toMatchObject({ id: "health", on: true });
    expect(askFirstTopicsFor(null).map((t) => t.id)).toEqual([
      "refunds",
      "discounts",
      "big_orders",
    ]);
  });
});

describe("askFirstMatch", () => {
  it("finds a chosen topic in the message", () => {
    expect(askFirstMatch("Can I get a refund for my order?", ["refunds"])).toBe("refunds");
    expect(askFirstMatch("Is the ensaymada gluten free?", ["refunds", "allergies"])).toBe(
      "allergies",
    );
    expect(askFirstMatch("Any discount for 3 boxes?", ["discounts"])).toBe("discounts");
    expect(askFirstMatch("Can you do 50 pcs for a party?", ["big_orders"])).toBe("big_orders");
  });

  it("ignores topics that aren't chosen", () => {
    expect(askFirstMatch("Is it gluten free?", ["refunds"])).toBeNull();
    expect(askFirstMatch("What time do you open?", ["refunds", "allergies"])).toBeNull();
    expect(askFirstMatch("refund please", [])).toBeNull();
  });

  it("checks ids", () => {
    expect(isAskFirstId("refunds")).toBe(true);
    expect(isAskFirstId("nope")).toBe(false);
  });
});

describe("the owner's own topics", () => {
  it("cleans what was typed into the stored form", () => {
    expect(customTopic("  Wedding   Cakes! ")).toBe("custom:wedding cakes");
    expect(customTopic("x")).toBeNull();
    expect(customTopic("a".repeat(41))).toBeNull();
    expect(isCustomTopic("custom:wedding cakes")).toBe(true);
    expect(isCustomTopic("custom:Wedding")).toBe(false);
    expect(customLabel("custom:rush orders")).toBe("rush orders");
  });
  it("matches the words typed, plurals too, as a phrase", () => {
    const topics = ["custom:wedding cake", "custom:rush orders"];
    expect(askFirstMatch("Do you make wedding cakes?", topics)).toBe("custom:wedding cake");
    expect(askFirstMatch("Is a rush order possible?", topics)).toBe("custom:rush orders");
    expect(askFirstMatch("A cake for my wedding?", topics)).toBeNull();
    expect(askFirstMatch("weddingcakes", topics)).toBeNull();
  });
  it("only when chosen, after the built-in topics", () => {
    expect(askFirstMatch("wedding cake refund", ["refunds", "custom:wedding cake"])).toBe(
      "refunds",
    );
    expect(askFirstMatch("wedding cake", [])).toBeNull();
  });
});
