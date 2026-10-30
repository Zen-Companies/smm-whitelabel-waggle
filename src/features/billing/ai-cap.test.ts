import { describe, expect, it } from "vitest";
import { parseCapInput } from "./ai-cap";

describe("parseCapInput (T32)", () => {
  it("blank means the default", () => {
    expect(parseCapInput("")).toEqual({ cap: null });
    expect(parseCapInput("  ")).toEqual({ cap: null });
    expect(parseCapInput(null)).toEqual({ cap: null });
  });

  it("takes dollars, rounded to cents; 0 turns drafting off", () => {
    expect(parseCapInput("25")).toEqual({ cap: 25 });
    expect(parseCapInput("$7.499")).toEqual({ cap: 7.5 });
    expect(parseCapInput("0")).toEqual({ cap: 0 });
  });

  it("refuses anything else", () => {
    expect(parseCapInput("-1")).toHaveProperty("error");
    expect(parseCapInput("abc")).toHaveProperty("error");
    expect(parseCapInput("20000")).toHaveProperty("error");
  });
});
