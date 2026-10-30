import { describe, expect, it } from "vitest";
import { changesByTopic, countDecisions, readiness, readinessProgress } from "./readiness";

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

describe("readinessProgress", () => {
  it("counts toward the minimum until there are more replies than that", () => {
    expect(readinessProgress({ asWritten: 6, edited: 1, rejected: 0 })).toEqual({
      done: 6,
      of: 10,
    });
    expect(readinessProgress({ asWritten: 23, edited: 0, rejected: 0 })).toEqual({
      done: 23,
      of: 23,
    });
  });
});

describe("changesByTopic", () => {
  const titles = new Map([
    ["kb-1", "Reservations"],
    ["kb-2", "Custom cakes"],
  ]);
  const d = (status: string, edited: string | null, ids: string[], owner = "u") => ({
    status,
    edited_body: edited,
    decided_by: owner,
    kb_entry_ids: ids,
  });

  it("groups edited and rejected replies by their best-matching topic", () => {
    expect(
      changesByTopic(
        [
          d("sent", "fixed", ["kb-1", "kb-2"]),
          d("rejected", null, ["kb-1"]),
          d("sent", "fixed", ["kb-2"]),
          d("sent", null, ["kb-2"]),
          d("sent", "fixed", []),
          d("sent", "fixed", ["kb-gone"]),
        ],
        titles,
      ),
    ).toEqual([
      { topicId: "kb-1", title: "Reservations", count: 2 },
      { topicId: "kb-2", title: "Custom cakes", count: 1 },
      { topicId: null, title: "No business info", count: 1 },
      { topicId: null, title: "A topic you removed", count: 1 },
    ]);
  });

  it("ignores replies nobody decided on", () => {
    expect(changesByTopic([d("sent", "x", ["kb-1"], null as unknown as string)], titles)).toEqual(
      [],
    );
  });
});
