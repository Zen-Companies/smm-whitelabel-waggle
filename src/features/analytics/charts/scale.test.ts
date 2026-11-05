import { describe, expect, it } from "vitest";
import { labelIndexes, linear, niceTicks, rampStep } from "./scale";

describe("niceTicks", () => {
  it("starts at zero with round steps", () => {
    expect(niceTicks(0, 1240)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0, 20)).toEqual([0, 5, 10, 15, 20]);
  });

  it("hugs the data when zero isn't required", () => {
    expect(niceTicks(2745, 2841, 3, false)).toEqual([2700, 2750, 2800, 2850]);
  });

  it("copes with flat and empty data", () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
    expect(niceTicks(5, 5, 4, false).length).toBeGreaterThan(1);
  });
});

describe("linear and labelIndexes", () => {
  it("maps a domain onto a range", () => {
    const y = linear(0, 100, 200, 0);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
  });

  it("spreads labels and keeps both ends", () => {
    expect(labelIndexes(30, 5)).toEqual([0, 7, 15, 22, 29]);
    expect(labelIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(labelIndexes(0, 5)).toEqual([]);
  });
});

describe("rampStep", () => {
  it("puts zero on the lightest step and the busiest cell on the darkest", () => {
    expect(rampStep(0, 100)).toBe(0);
    expect(rampStep(100, 100)).toBe(6);
    expect(rampStep(50, 100)).toBe(3);
    expect(rampStep(5, 0)).toBe(0);
  });
});
