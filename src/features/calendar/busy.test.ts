import { describe, expect, it } from "vitest";
import { busyLines, localParts, parseBooking, todayLine } from "./busy";

const ev = (
  start: string,
  end: string,
  over: Partial<{ allDay: boolean; busy: boolean }> = {},
) => ({
  id: start,
  title: "Private title",
  start,
  end,
  allDay: false,
  busy: true,
  ...over,
});

describe("busyLines", () => {
  it("lists busy times in the calendar's own time, never the titles", () => {
    expect(
      busyLines([
        ev("2026-11-21T09:00:00+08:00", "2026-11-21T09:30:00+08:00"),
        ev("2026-11-21T14:00:00+08:00", "2026-11-21T15:00:00+08:00"),
        ev("2026-11-22", "2026-11-23", { allDay: true }),
        ev("2026-11-22T10:00:00+08:00", "2026-11-22T11:00:00+08:00", { busy: false }),
      ]),
    ).toEqual(["Sat 21 Nov, 09:00 to 09:30", "Sat 21 Nov, 14:00 to 15:00", "Sun 22 Nov, all day"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      ev(
        `2026-11-21T${String(i % 24).padStart(2, "0")}:00:00Z`,
        `2026-11-21T${String(i % 24).padStart(2, "0")}:30:00Z`,
      ),
    );
    expect(busyLines(many)).toHaveLength(40);
  });
});

describe("todayLine and localParts", () => {
  it("names today in the calendar's offset", () => {
    expect(todayLine(new Date("2026-11-13T18:00:00Z"), "+08:00")).toBe("Today is Sat 14 Nov 2026.");
    expect(todayLine(new Date("2026-11-13T18:00:00Z"), null)).toBe(
      "Today is Fri 13 Nov 2026 (UTC).",
    );
  });

  it("reads a time's own date, hour and offset", () => {
    expect(localParts("2026-11-21T09:00:00+08:00")).toEqual({
      date: "2026-11-21",
      time: "09:00",
      offset: "+08:00",
    });
    expect(localParts("2026-11-21T09:00:00Z")).toMatchObject({ offset: "+00:00" });
  });
});

describe("parseBooking", () => {
  const form = (v: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(v)) f.set(k, val);
    return f;
  };
  it("builds start and end in the offset given", () => {
    expect(
      parseBooking(
        form({
          title: "Maria: catering",
          date: "2026-11-21",
          time: "09:00",
          minutes: "60",
          offset: "+08:00",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        title: "Maria: catering",
        start: "2026-11-21T09:00:00+08:00",
        end: "2026-11-21T10:00:00+08:00",
      },
    });
  });

  it("refuses a missing title, a bad date or a length out of range", () => {
    const ok = { title: "x", date: "2026-11-21", time: "09:00", minutes: "60", offset: "+08:00" };
    expect(parseBooking(form({ ...ok, title: " " }))).toMatchObject({ ok: false, field: "title" });
    expect(parseBooking(form({ ...ok, date: "21/11" }))).toMatchObject({
      ok: false,
      field: "date",
    });
    expect(parseBooking(form({ ...ok, minutes: "0" }))).toMatchObject({
      ok: false,
      field: "minutes",
    });
    expect(parseBooking(form({ ...ok, offset: "UTC" }))).toMatchObject({ ok: false });
  });

  it("crosses midnight correctly", () => {
    expect(
      parseBooking(
        form({ title: "x", date: "2026-11-21", time: "23:30", minutes: "60", offset: "+08:00" }),
      ),
    ).toMatchObject({ value: { end: "2026-11-22T00:30:00+08:00" } });
  });
});
