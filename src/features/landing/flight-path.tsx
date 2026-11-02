"use client";

import { useEffect, useRef, useState } from "react";
import { BeeBody } from "@/components/app/bee";
import {
  distanceForScroll,
  flightWaypoints,
  smoothPath,
  type FlightAnchor,
  type FlightAnchorKind,
} from "./flight-geometry";

const SAMPLES = 600;
/** The bee eases toward the scroll target: this much of the gap per frame. */
const EASE = 0.12;
/** The hero loop's duration (BeeDance's animateMotion). */
const LOOP_SECONDS = 9;
/** How close to the figure-8's center (as a fraction of the loop) the looping bee must be to swap. */
const SWAP_WINDOW = 0.05;

interface Geometry {
  d: string;
  width: number;
  height: number;
}

/**
 * One dotted trail down the whole landing page (docs/design.md §6, "the dance"), measured from
 * the real layout: it starts at the hero figure-8, runs down the gutter between the two columns
 * with a gentle sway, and lands beside the pricing button. The bee's position is the scroll position, eased; the honey draws behind it. Nothing
 * moves unless the reader does. Under 768px, with reduced motion, or without `offset-path`,
 * only the static trail (or nothing) shows.
 */
export function FlightPath() {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [still, setStill] = useState(false);
  const trailRef = useRef<SVGPathElement>(null);
  const honeyRef = useRef<SVGPathElement>(null);
  const beeRef = useRef<HTMLSpanElement>(null);

  // Measure the page and build the path; again whenever the layout changes size.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root) return;
    const wide = window.matchMedia("(min-width: 768px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const supported =
      typeof CSS !== "undefined" && CSS.supports("offset-path", 'path("M0,0 L1,1")');
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (!wide.matches || (!supported && !reduced.matches)) {
        setGeometry(null);
        delete root.dataset.flightState;
        return;
      }
      setStill(reduced.matches);
      const rootRect = root.getBoundingClientRect();
      const anchors: FlightAnchor[] = [];
      for (const el of root.querySelectorAll<HTMLElement>("[data-flight]")) {
        const r = el.getBoundingClientRect();
        anchors.push({
          kind: el.dataset.flight as FlightAnchorKind,
          rect: {
            left: r.left - rootRect.left,
            top: r.top - rootRect.top,
            width: r.width,
            height: r.height,
          },
        });
      }
      const points = flightWaypoints(anchors, rootRect.width);
      if (points.length < 2) {
        setGeometry(null);
        return;
      }
      setGeometry({
        d: smoothPath(points),
        width: Math.round(rootRect.width),
        height: Math.round(rootRect.height),
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    wide.addEventListener("change", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      wide.removeEventListener("change", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);

  // Fly: sample the path once, then follow the scroll with easing. The hero's own loop keeps
  // running until the path bee has somewhere to go; the swap waits for the looping bee to pass
  // the center of the figure-8 (where the path starts), unless the hero is off screen. Back at
  // the top, the path bee eases to that center and the loop restarts from it.
  useEffect(() => {
    const trail = trailRef.current;
    const honey = honeyRef.current;
    const bee = beeRef.current;
    const root = document.querySelector<HTMLElement>("[data-landing]");
    const dance = root?.querySelector<SVGSVGElement>('[data-flight="dance"] svg');
    const motion = dance?.querySelector<SVGAnimationElement>("animateMotion");
    if (!geometry || still || !trail || !honey || !bee || !root || !dance || !motion) return;

    const total = trail.getTotalLength();
    const ys: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      ys.push(trail.getPointAtLength((i / (SAMPLES - 1)) * total).y);
    }
    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

    let mode: "idle" | "scrolled" = "idle";
    let pending: "toScrolled" | "toIdle" | null = null;
    let loopStart = 0; // SVG document time when the hero loop last (re)started at the center
    let current = 0;
    let target = 0;
    let frame = 0;

    const paint = () => {
      bee.style.offsetDistance = `${current}px`;
      honey.style.strokeDashoffset = `${100 - (100 * current) / total}`;
    };
    const setMode = (next: typeof mode) => {
      mode = next;
      root.dataset.flightState = next;
    };
    /** The looping bee is at the center of the figure-8 at phase 0 and 0.5 of its loop. */
    const loopBeeNearCenter = () => {
      const phase =
        ((((dance.getCurrentTime() - loopStart) % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS) /
        LOOP_SECONDS;
      const off = Math.min(phase, Math.abs(phase - 0.5), 1 - phase);
      return off < SWAP_WINDOW;
    };
    const heroOffScreen = () => {
      const r = dance.getBoundingClientRect();
      return r.bottom < 0 || r.top > window.innerHeight;
    };

    const tick = () => {
      frame = 0;
      if (pending === "toScrolled" && (heroOffScreen() || loopBeeNearCenter())) {
        pending = null;
        setMode("scrolled");
      }
      if (mode === "scrolled") {
        const gap = target - current;
        if (Math.abs(gap) < 0.5) current = target;
        else current += gap * EASE;
        paint();
        if (pending === "toIdle" && current === 0) {
          pending = null;
          motion.beginElement();
          loopStart = dance.getCurrentTime();
          setMode("idle");
        }
      }
      if (pending || (mode === "scrolled" && current !== target))
        frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      target = distanceForScroll(ys, total, window.scrollY, window.innerHeight, maxScroll());
      if (mode === "idle") pending = target > 0 ? "toScrolled" : null;
      else pending = target === 0 ? "toIdle" : null;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // Arrive where the reader already is: mid-page, the hero is off screen, so swap at once.
    setMode("idle");
    paint();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [geometry, still]);

  if (!geometry) return null;
  const { d, width, height } = geometry;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 hidden md:block"
      style={{ width, height }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0"
      >
        <path
          ref={trailRef}
          d={d}
          fill="none"
          stroke="var(--line)"
          strokeWidth="2"
          strokeDasharray="2 7"
          strokeLinecap="round"
        />
        {!still && (
          <path
            ref={honeyRef}
            d={d}
            pathLength={100}
            fill="none"
            stroke="var(--honey)"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ strokeDasharray: 100, strokeDashoffset: 100 }}
          />
        )}
      </svg>
      {!still && (
        <span
          ref={beeRef}
          className="flight-bee"
          style={{
            width: 30,
            height: 20,
            margin: "-10px 0 0 -15px",
            offsetPath: `path("${d}")`,
            offsetDistance: "0px",
          }}
        >
          <svg width="30" height="20" viewBox="0 0 24 16">
            <BeeBody />
          </svg>
        </span>
      )}
    </div>
  );
}
