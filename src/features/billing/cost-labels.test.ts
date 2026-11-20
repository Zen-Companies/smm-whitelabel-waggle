import { describe, expect, it } from "vitest";
import { purposeLabel, statusLabel } from "./cost-labels";

describe("statusLabel", () => {
  it("maps known statuses to plain words", () => {
    expect(statusLabel("awaiting_approval")).toBe("Waiting for approval");
    expect(statusLabel("sent")).toBe("Sent");
  });
  it("replaces every underscore in unknown statuses", () => {
    expect(statusLabel("some_new_state")).toBe("Some new state");
  });
});

describe("purposeLabel", () => {
  it("maps AI call purposes", () => {
    expect(["classify", "embed", "draft", "agent"].map(purposeLabel)).toEqual([
      "Sort",
      "Lookup",
      "Draft",
      "Agent",
    ]);
  });
  it("capitalizes anything else", () => {
    expect(purposeLabel("suggest")).toBe("Suggest");
  });
});
