import { describe, expect, it } from "vitest";
import { generateBetaCode, normalizeBetaCode } from "./codes";

describe("generateBetaCode", () => {
  it("makes WAGGLE-XXXX without look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBetaCode();
      expect(code).toMatch(/^WAGGLE-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});

describe("normalizeBetaCode", () => {
  it("accepts typed codes in any case", () => {
    expect(normalizeBetaCode(" fbgroup ")).toBe("FBGROUP");
    expect(normalizeBetaCode("harbour-7k2p")).toBe("HARBOUR-7K2P");
  });
  it("refuses what can't be a code", () => {
    expect(normalizeBetaCode("ab")).toBeNull();
    expect(normalizeBetaCode("-START")).toBeNull();
    expect(normalizeBetaCode("bad code!")).toBeNull();
  });
});
