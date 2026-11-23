import { describe, expect, it } from "vitest";
import {
  closedWeek,
  formatHours,
  openDaysFromText,
  openDaysOf,
  openDaysSchema,
  parseHours,
  sameEveryDay,
  weekOf,
} from "./chat-hours";

describe("the week", () => {
  it("says what customers will see, days with the same hours grouped", () => {
    const week = weekOf([{ day: "mon", open: "09:00", close: "17:00" }]);
    expect(formatHours(week)).toBe("Mon 9am–5pm, Tue–Sun closed");
    expect(
      formatHours(
        weekOf([
          ...(["mon", "tue", "wed", "thu", "fri", "sat"] as const).map((day) => ({
            day,
            open: "08:00",
            close: "22:00",
          })),
        ]),
      ),
    ).toBe("Mon–Sat 8am–10pm, Sun closed");
  });

  it("reads its own line back, and the common ones", () => {
    const line = "Mon–Sat 8am–6:30pm, Sun closed";
    expect(formatHours(parseHours(line)!)).toBe(line);
    expect(formatHours(parseHours("Monday to Friday: 9:00 AM - 5:00 PM")!)).toBe(
      "Mon–Fri 9am–5pm, Sat–Sun closed",
    );
    expect(parseHours("by appointment")).toBeNull();
    expect(openDaysFromText(null)).toEqual([]);
    expect(openDaysFromText("Sun 8am–9pm")).toEqual([
      { day: "sun", open: "08:00", close: "21:00" },
    ]);
  });

  it("copies the first open day to every day", () => {
    const week = weekOf([{ day: "wed", open: "07:30", close: "15:00" }]);
    expect(formatHours(sameEveryDay(week))).toBe("Mon–Sun 7:30am–3pm");
    expect(formatHours(sameEveryDay(closedWeek()))).toBe("Mon–Sun 9am–5pm");
    expect(openDaysOf(sameEveryDay(closedWeek()))).toHaveLength(7);
  });

  it("checks days strictly", () => {
    expect(openDaysSchema.safeParse([{ day: "mon", open: "24:00", close: "10:00" }]).success).toBe(
      false,
    );
    expect(openDaysSchema.safeParse([{ day: "mon", open: "8am", close: "10:00" }]).success).toBe(
      false,
    );
    expect(openDaysSchema.safeParse([{ day: "mon", open: "08:00", close: "22:00" }]).success).toBe(
      true,
    );
  });
});
