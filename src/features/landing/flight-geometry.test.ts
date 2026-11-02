import { describe, expect, it } from "vitest";
import {
  distanceForScroll,
  firstIndexReaching,
  flightWaypoints,
  monotoneEnvelope,
  smoothPath,
  type FlightAnchor,
} from "./flight-geometry";

const rect = (left: number, top: number, width = 400, height = 200) => ({
  left,
  top,
  width,
  height,
});

describe("flightWaypoints", () => {
  const anchors: FlightAnchor[] = [
    { kind: "dance", rect: rect(160, 464, 1120, 300) },
    { kind: "gutter", rect: rect(160, 940, 1120, 260) },
    { kind: "gutter", rect: rect(160, 1300, 1120, 260) },
    { kind: "gutter", rect: rect(160, 1900, 1120, 300) },
    { kind: "end", rect: rect(745, 3200, 120, 48) },
  ];

  it("starts at the center of the dance and lands just left of the button, coming from above", () => {
    const pts = flightWaypoints(anchors, 1440);
    expect(pts[0]).toEqual({ x: 720, y: 614 });
    expect(pts[pts.length - 2]).toEqual({ x: 717, y: 3134 });
    expect(pts[pts.length - 1]).toEqual({ x: 717, y: 3224 });
  });

  it("sways either side of the gutter's center, never further than the gutter allows", () => {
    const pts = flightWaypoints(anchors, 1440);
    expect(pts[1]).toEqual({ x: 738, y: 1070 });
    expect(pts[2]).toEqual({ x: 702, y: 1430 });
    expect(pts[3]).toEqual({ x: 738, y: 2050 });
  });

  it("drops a waypoint that doesn't descend", () => {
    const pts = flightWaypoints(
      [
        { kind: "dance", rect: rect(160, 464, 1120, 300) },
        { kind: "gutter", rect: rect(160, 500, 1120, 200) },
        { kind: "gutter", rect: rect(160, 900, 1120, 200) },
      ],
      1440,
    );
    expect(pts).toHaveLength(2);
    expect(pts[1].y).toBe(1000);
  });
});

describe("smoothPath", () => {
  it("is empty for no points and a move for one", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 1, y: 2 }])).toBe("M1,2");
  });

  it("draws one cubic per segment, ending on the points themselves", () => {
    const d = smoothPath([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 200 },
    ]);
    expect(d.startsWith("M0,0 C")).toBe(true);
    expect((d.match(/ C/g) ?? []).length).toBe(2);
    expect(d.endsWith(" 0,200")).toBe(true);
    expect(d).toContain(" 100,100 C");
  });
});

describe("scroll mapping", () => {
  it("envelope never decreases", () => {
    expect(monotoneEnvelope([5, 3, 8, 7, 9])).toEqual([5, 5, 8, 8, 9]);
  });

  it("finds the first index reaching the target, or the last", () => {
    expect(firstIndexReaching([0, 10, 20, 30], 15)).toBe(2);
    expect(firstIndexReaching([0, 10, 20, 30], 0)).toBe(0);
    expect(firstIndexReaching([0, 10, 20, 30], 99)).toBe(3);
    expect(firstIndexReaching([], 1)).toBe(0);
  });

  it("maps the reading line of the window to a distance along the path", () => {
    const ys = [600, 700, 800, 900, 1000]; // 4 segments of a 1000-long path
    expect(distanceForScroll(ys, 1000, 0, 900, 5000)).toBe(0); // 342 < 600: at the start
    expect(distanceForScroll(ys, 1000, 500, 1000, 5000)).toBe(750); // 880 → index 3
  });

  it("lands at the end of the path when the page bottoms out, even if the end is below the reading line", () => {
    const ys = Array.from({ length: 41 }, (_, i) => 600 + i * 100); // a 4000-long path
    expect(distanceForScroll(ys, 4000, 3000, 900, 3000)).toBe(4000);
    // halfway through the glide the target has moved part of the way down, not all of it
    const mid = distanceForScroll(ys, 4000, 2550, 900, 3000);
    expect(mid).toBeGreaterThan(distanceForScroll(ys, 4000, 2550, 900, 0));
    expect(mid).toBeLessThan(4000);
  });
});
