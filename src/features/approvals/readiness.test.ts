import { describe, expect, it } from "vitest";
import { countDecisions, readiness } from "./readiness";

const owner = "user-1";

describe("countDecisions", () => {
  it("counts the owner's decisions, not auto-sent replies", () => {
    expect(
      countDecisions([
        { status: "sent", edited_body: null, decided_by: owner },
        { status: "approved", edited_body: null, decided_by: owner },
        { status: "sent", edited_body: "Fixed price", decided_by: owner },
        { status: "rejected", edited_body: null, decided_by: owner },
        { status: "sent", edited_body: null, decided_by: null },
        { status: "pending", edited_body: null, decided_by: null },
      ]),
    ).toEqual({ asWritten: 2, edited: 1, rejected: 1 });
  });
});

describe("readiness", () => {
  it("ready: at least 10 sent as written, at most 1 in 10 changed", () => {
    expect(readiness({ asWritten: 21, edited: 2, rejected: 0 })).toEqual({
      ready: true,
      summary: "Last 14 days: 23 replies drafted. You sent 21 as written, edited 2, rejected none.",
      verdict: "Ready to reply on its own.",
    });
  });

  it("too many changes", () => {
    expect(readiness({ asWritten: 5, edited: 4, rejected: 0 })).toMatchObject({
      ready: false,
      verdict: "Not ready yet: you changed 4 of 9.",
    });
  });

  it("not enough checked yet", () => {
    expect(readiness({ asWritten: 9, edited: 0, rejected: 0 }).verdict).toBe(
      "Not ready yet: 1 more reply to check first.",
    );
  });

  it("nothing yet", () => {
    expect(readiness({ asWritten: 0, edited: 0, rejected: 0 })).toEqual({
      ready: false,
      summary: null,
      verdict: "Not ready yet: no replies checked in the last 14 days.",
    });
  });
});
