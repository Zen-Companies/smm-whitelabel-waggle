import { describe, expect, it } from "vitest";
import { teachTab } from "./teach-header";

describe("teachTab", () => {
  it("lights the part you're on, Overview only on /teach", () => {
    expect(teachTab("/teach")).toBe("/teach");
    expect(teachTab("/teach/business-info")).toBe("/teach/business-info");
    expect(teachTab("/teach/automations/comments")).toBe("/teach/automations");
    expect(teachTab("/teach/lab")).toBe("/teach/lab");
  });
});
