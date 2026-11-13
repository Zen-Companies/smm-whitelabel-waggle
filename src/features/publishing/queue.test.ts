import { describe, expect, it } from "vitest";
import { DAYS, gridToSlots, parseSlotsForm, slotsToGrid } from "./queue";

describe("queue slots", () => {
  it("the week starts on Monday; Zernio's days are 0 = Sunday", () => {
    expect(DAYS.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(DAYS.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("slots become a sorted grid per day, and back", () => {
    const slots = [
      { dayOfWeek: 1, time: "18:00" },
      { dayOfWeek: 1, time: "09:00" },
      { dayOfWeek: 0, time: "10:30" },
    ];
    const grid = slotsToGrid(slots);
    expect(grid[1]).toEqual(["09:00", "18:00"]);
    expect(grid[0]).toEqual(["10:30"]);
    expect(grid[3]).toEqual([]);
    expect(gridToSlots(grid)).toEqual([
      { dayOfWeek: 0, time: "10:30" },
      { dayOfWeek: 1, time: "09:00" },
      { dayOfWeek: 1, time: "18:00" },
    ]);
  });

  it("drops bad times and duplicates", () => {
    expect(
      slotsToGrid([
        { dayOfWeek: 2, time: "9:00" },
        { dayOfWeek: 2, time: "25:00" },
        { dayOfWeek: 2, time: "09:00" },
        { dayOfWeek: 2, time: "09:00" },
        { dayOfWeek: 9, time: "09:00" },
        { time: "09:00" },
      ])[2],
    ).toEqual(["09:00"]);
  });

  it("reads the form: day-N fields with comma-separated times", () => {
    const f = new FormData();
    f.set("day-1", "09:00, 18:00");
    f.set("day-6", "10:00");
    f.set("day-3", "nope");
    f.set("timezone", "Asia/Manila");
    expect(parseSlotsForm(f)).toEqual({
      timezone: "Asia/Manila",
      slots: [
        { dayOfWeek: 1, time: "09:00" },
        { dayOfWeek: 1, time: "18:00" },
        { dayOfWeek: 6, time: "10:00" },
      ],
    });
  });

  it("an unknown timezone is refused", () => {
    const f = new FormData();
    f.set("timezone", "Mars/Olympus");
    expect(parseSlotsForm(f)).toBeNull();
  });
});
