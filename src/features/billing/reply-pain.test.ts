import { describe, expect, it } from "vitest";
import { painTiles, perDayFromWeek, waitingLine } from "./reply-pain";

describe("reply pain (decision 9)", () => {
  it("averages a week into a day, 0 under one a day", () => {
    expect(perDayFromWeek(126)).toBe(18);
    expect(perDayFromWeek(6)).toBe(0);
    expect(perDayFromWeek(7)).toBe(1);
    expect(perDayFromWeek(10)).toBe(1);
  });

  it("shows only the tiles with something in them", () => {
    expect(painTiles(null)).toEqual([]);
    expect(painTiles({ perDay: 0, waiting: 0 })).toEqual([]);
    expect(painTiles({ perDay: 0, waiting: 2 })).toEqual([
      { n: "2", text: "waiting for a reply right now" },
    ]);
    expect(painTiles({ perDay: 18, waiting: 1200 })).toEqual([
      { n: "~18", text: "messages a day from customers" },
      { n: "1,200", text: "waiting for a reply right now" },
    ]);
  });

  it("says how many wait", () => {
    expect(waitingLine(0)).toBeNull();
    expect(waitingLine(1)).toBe("1 message is waiting for a reply.");
    expect(waitingLine(1200)).toBe("1,200 messages are waiting for a reply.");
  });
});
