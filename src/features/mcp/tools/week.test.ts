import { describe, expect, it } from "vitest";
import type { WeekRunView } from "@/features/weekly";
import { ToolError, type ToolContext } from "../context";
import { getWeek, runWeekCheck, weekOf } from "./week";

const run: WeekRunView = {
  trigger: "monday",
  from: "2026-11-16T00:00:00.000Z",
  to: "2026-11-23T00:00:00.000Z",
  finishedAt: "2026-11-23T07:02:00.000Z",
  summary: {
    cameIn: 42,
    answeredByWaggle: 30,
    answeredByYou: 6,
    waiting: 4,
    closingToday: 1,
    found: 3,
    tooOld: 2,
    previousCameIn: 35,
    accounts: [
      {
        id: "acc1",
        platform: "instagram",
        name: "@harbourbean",
        state: "read",
        reason: null,
        count: 30,
      },
      {
        id: "acc2",
        platform: "facebook",
        name: "Harbour Bean",
        state: "failed",
        reason: "reconnect",
        count: 12,
      },
    ],
    topics: [{ topic: "hours", label: "Opening hours", count: 9 }],
    gaps: [{ text: "Do you take dogs?", times: 3 }],
  },
};

describe("weekOf: a stored check-up as the assistant gets it", () => {
  it("numbers, accounts, topics, and the questions Waggle couldn't answer", () => {
    const w = weekOf(run);
    expect(w).toMatchObject({ trigger: "monday", checked_at: run.finishedAt });
    expect(w.numbers).toEqual({
      came_in: 42,
      previous_came_in: 35,
      answered_by_waggle: 30,
      answered_by_you: 6,
      waiting: 4,
      closing_today: 1,
      found: 3,
      too_old: 2,
    });
    expect(w.by_account[1]).toEqual({
      account_id: "acc2",
      platform: "facebook",
      name: "Harbour Bean",
      state: "failed",
      reason: "reconnect",
      messages: 12,
    });
    expect(w.what_people_wanted).toEqual([{ topic: "hours", label: "Opening hours", count: 9 }]);
    // A customer's words: named customer_* (untrusted).
    expect(w.uncovered_questions).toEqual([{ customer_question: "Do you take dogs?", times: 3 }]);
  });

  it("the output schema accepts it", () => {
    expect(() =>
      getWeek.output.parse({
        latest: weekOf(run),
        running: null,
        check_now: { available: true, last_at: null },
        next_monday_run: "2026-11-30T07:00:00.000Z",
      }),
    ).not.toThrow();
  });
});

it("run_week_check: the owner's Check now, with the app's ability and a brand id only", async () => {
  expect(runWeekCheck.ability).toBe("replies.approve");
  expect(Object.keys(runWeekCheck.input.shape)).toEqual(["brand_id"]);
  const e = await runWeekCheck.run({} as ToolContext, { brand_id: "x" }).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ToolError);
});
