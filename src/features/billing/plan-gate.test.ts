import { describe, expect, it } from "vitest";
import { planGate, type PlanGateInput } from "./plan-gate";

const base: PlanGateInput = {
  live: false,
  test: false,
  role: "owner",
  staffSkipped: false,
  justCheckedOut: false,
};

describe("plan before setup", () => {
  it("an owner without a plan picks one", () => {
    expect(planGate(base)).toBe("pick");
  });
  it("a seat on a team without a plan asks the owner", () => {
    expect(planGate({ ...base, role: "member" })).toBe("ask_owner");
    expect(planGate({ ...base, role: "admin" })).toBe("ask_owner");
  });
  it("a live plan, a test brand, a staff skip or a fresh checkout pass", () => {
    expect(planGate({ ...base, live: true })).toBe("open");
    expect(planGate({ ...base, role: "member", live: true })).toBe("open");
    expect(planGate({ ...base, test: true })).toBe("open");
    expect(planGate({ ...base, staffSkipped: true })).toBe("open");
    expect(planGate({ ...base, justCheckedOut: true })).toBe("open");
  });
});
