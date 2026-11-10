"use client";

import { useEffect, useRef } from "react";

// The guide bee: starts on the hero's figure-8, follows the reader down the page,
// and at each section flies to its label and does the waggle dance, the way a bee
// tells the hive "the good stuff is here". On the closing button it lands, like the bee on the logo.
//
// Motion is spring physics plus layered, uneven wobble, and every behaviour fades in and out
// (dance, drift, perch), so nothing starts or stops on a hard edge.
const STRIPES = "M-6 -12.4 C-8 -4 -8 4 -6 12.4 M3 -12.6 C1 -4 1 4 3 12.6";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// ease a value toward a target at `rate` per second, independent of frame rate
const approach = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));

export function GuideBee() {
  const beeRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bee = beeRef.current!;
    const body = bodyRef.current!;
    const bubble = bubbleRef.current!;
    const hero = document.getElementById("top");

    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let vx = 0;
    let vy = 0;
    let facing = 1; // continuous: passes near 0 as the bee turns around
    let tilt = 0;
    let dance = 0; // 0..1, how much it's waggling
    let perch = 0; // 0..1, how settled it is on the button
    let lastStop: Element | null = null;
    let last = performance.now();
    // perched "sales pitch": an uneven loop of hops, pecks at the button, wing flutters and glances
    let action: "hop" | "peck" | "flutter" | "glance" | null = null;
    let actionAt = 0;
    let nextActionAt = 0;
    let lines: string[] = [];
    let lineIdx = 0;
    let nextLineAt = 0;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const vw = innerWidth;
      const vh = innerHeight;
      const small = vw < 768;

      // 1. Is a checkpoint in the reading zone?
      let stop: Element | null = null;
      for (const el of document.querySelectorAll("[data-bee-stop]")) {
        const r = el.getBoundingClientRect();
        // labels are caught in the reading zone; the perch (closing button) as soon as it's well on screen
        const lowest = el.hasAttribute("data-bee-perch") ? vh * 0.85 : vh * 0.58;
        if (r.top > vh * 0.12 && r.top < lowest) {
          stop = el;
          break;
        }
      }
      // a perch is the closing button or a section's flower: the bee lands on it instead of waggling
      const flower = stop?.querySelector(".act-flower") ?? null;
      const onButton = !!stop?.hasAttribute("data-bee-perch");
      const perching = onButton || !!flower;

      if (stop !== lastStop) {
        lastStop?.classList.remove("bee-here");
        if (stop) {
          stop.classList.add("bee-here");
          lines = [stop.getAttribute("data-bee-stop") ?? "", ...(stop.getAttribute("data-bee-lines")?.split("|") ?? [])];
          lineIdx = 0;
          nextLineAt = t + 6;
          nextActionAt = t + 1.2;
          bubble.textContent = lines[0];
          // kit rule: the head always contrasts the ground, so over an always-dark section use Wax
          const dark = stop.closest("[data-ground='dark']");
          bee.style.setProperty("--bee-head", dark ? "#FFF6E6" : "");
          bee.style.setProperty("--bee-wing", dark ? "rgb(255 246 230 / 0.75)" : "");
        } else {
          bee.style.removeProperty("--bee-head");
          bee.style.removeProperty("--bee-wing");
        }
        lastStop = stop;
      }

      // 2. Where it wants to be
      let tx: number;
      let ty: number;
      let wantFacing = facing;
      if (flower) {
        // rest on top of the petals so the bloom still shows underneath, facing back at the section label
        const r = flower.getBoundingClientRect();
        tx = r.left + r.width / 2 + 3;
        ty = r.top - 5;
        wantFacing = -1;
      } else if (stop && perching) {
        // on top of the button toward its right end, like the bee on the logo
        const r = stop.getBoundingClientRect();
        tx = r.left + r.width * 0.74;
        ty = r.top - 9;
        wantFacing = 1;
      } else if (stop) {
        const range = document.createRange();
        range.selectNodeContents(stop);
        const r = range.getBoundingClientRect();
        tx = Math.min(r.right + (small ? 34 : 44), vw - 40);
        ty = r.top + r.height / 2 - 4;
        wantFacing = -1; // look back at the label
      } else {
        // a figure-8 (x = sin t, y = sin 2t) around the centre: big over the hero, smaller further down
        const hr = hero?.getBoundingClientRect();
        const inHero = hr ? clamp(hr.bottom / (hr.height * 0.7), 0, 1) : 0;
        const phase = t * 0.55 + scrollY / 260;
        const followA = Math.min(vw * 0.2, 230);
        const A = followA + (Math.min(vw * 0.32, 500) - followA) * inHero;
        const cy = hr && inHero > 0 ? (hr.top + hr.height * 0.55) * inHero + vh * 0.5 * (1 - inHero) : vh * 0.5;
        tx = vw / 2 + Math.sin(phase) * A;
        ty = cy + Math.sin(phase * 2) * A * 0.28;
        if (Math.abs(vx) > 40) wantFacing = vx > 0 ? 1 : -1;
      }

      // 3. Fade behaviours in and out instead of switching them on and off
      const wantDance = stop && !perching ? 1 : 0;
      dance = approach(dance, wantDance, wantDance ? 1.6 : 3.5, dt);
      const dist = Math.hypot(tx - x, ty - y);
      perch = approach(perch, perching && dist < 14 ? 1 : 0, perching ? 4 : 8, dt);

      // the waggle comes in uneven bursts, like a real dance run, not a metronome
      const burst = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.1 + Math.sin(t * 0.7) * 1.4)) ** 1.6;
      const w = dance * burst;
      tx += (Math.sin(t * 7.3) + 0.35 * Math.sin(t * 12.1)) * 13 * w;
      ty += (Math.sin(t * 13.4) * 3.5 + Math.sin(t * 5.2) * 1.5) * w;

      // idle drift: layered slow sines that never line up, faded out once it has landed
      const drift = 1 - perch;
      tx += (Math.sin(t * 0.93) * 6 + Math.sin(t * 1.71 + 1) * 3) * drift;
      ty += (Math.sin(t * 1.27 + 2) * 5 + Math.sin(t * 2.89) * 2) * drift;

      // 4. Spring toward the target: momentum, a touch of overshoot, then settle
      const k = perching ? 70 : stop ? 55 : 16;
      const zeta = perching ? 0.95 : stop ? 0.62 : 0.8;
      const c = 2 * Math.sqrt(k) * zeta;
      vx += (k * (tx - x) - c * vx) * dt;
      vy += (k * (ty - y) - c * vy) * dt;
      x += vx * dt;
      y += vy * dt;

      // 5. Body language: turn smoothly, lean into the flight, settle to the logo's -8° on the perch
      facing = approach(facing, wantFacing, 7, dt);
      const lean = clamp(vy * 0.04, -24, 24) * Math.sign(facing || 1);
      const shake = (Math.sin(t * 19) + 0.4 * Math.sin(t * 31)) * 16 * w;
      tilt = approach(tilt, perch > 0.5 ? -8 : lean + shake, perch > 0.5 ? 6 : 12, dt);

      bubble.dataset.show = stop ? "true" : "false";
      bubble.dataset.side = x > vw - 170 ? "left" : "right";
      // on the perch the bubble sits beside the bee so it doesn't cover the line above the button
      bubble.dataset.pos = onButton ? "beside" : "above";
      // 6. On the perch, keep pitching the button
      let hopY = 0;
      let pitchTilt = 0;
      let glance = 0;
      const landed = perch > 0.9;
      if (landed) {
        if (!action && t >= nextActionAt) {
          // on the button it pitches (hops, pecks); on a flower it feeds (dips for nectar, flutters)
          const pick = flower
            ? (["peck", "flutter", "glance", "peck"] as const)
            : (["hop", "peck", "flutter", "hop", "glance", "peck"] as const);
          action = pick[Math.floor((t * 7.31) % pick.length)];
          actionAt = t;
          const tapped = flower ?? stop;
          if (action === "peck" && tapped) {
            tapped.classList.remove("bee-tap");
            void (tapped as HTMLElement).getBoundingClientRect(); // restart the pulse
            tapped.classList.add("bee-tap");
          }
        }
        const p = t - actionAt;
        // when an action finishes, wait an uneven 0.9–2.2s before the next one
        const end = () => {
          action = null;
          nextActionAt = t + 0.9 + ((t * 3.7) % 1.3);
        };
        if (action === "hop") {
          // two quick hops, the second smaller
          hopY = p < 0.32 ? -16 * Math.sin((Math.PI * p) / 0.32) : p < 0.56 ? -7 * Math.sin((Math.PI * (p - 0.32)) / 0.24) : 0;
          if (p > 0.56) end();
        } else if (action === "peck") {
          // lean down toward the button label, tap, come back up
          pitchTilt = 26 * Math.sin(Math.PI * clamp(p / 0.5, 0, 1));
          hopY = 3 * Math.sin(Math.PI * clamp(p / 0.5, 0, 1));
          if (p > 0.5) end();
        } else if (action === "flutter") {
          hopY = -5 * Math.sin(Math.PI * clamp(p / 0.7, 0, 1));
          if (p > 0.7) end();
        } else if (action === "glance") {
          // turn round to the reader and back
          glance = Math.sin(Math.PI * clamp(p / 1.1, 0, 1));
          if (p > 1.1) end();
        }

        // rotate the pitch lines, fading one out before the next comes in
        if (lines.length > 1 && t >= nextLineAt) {
          bubble.dataset.swap = "true";
          if (t >= nextLineAt + 0.4) {
            lineIdx = (lineIdx + 1) % lines.length;
            bubble.textContent = lines[lineIdx];
            bubble.dataset.swap = "false";
            nextLineAt = t + 6 + ((t * 1.9) % 1.5); // each line stays up 6–7.5s
          }
        }
      } else {
        action = null;
      }
      // wings buzz fast when flying or fluttering, lazily while sitting
      body.classList.toggle("perched", landed && action !== "flutter" && action !== "hop");

      bee.style.transform = `translate3d(${x}px, ${y + hopY * perch}px, 0)`;
      // keep a sliver of width mid-turn so it reads as turning, not vanishing
      const sx = Math.abs(facing) < 0.15 ? 0.15 * Math.sign(facing || 1) : facing;
      const look = sx * (1 - 2 * glance * glance); // glance: flips to face the reader for a moment
      body.style.transform = `translate(-50%, -50%) scaleX(${Math.abs(look) < 0.15 ? 0.15 * Math.sign(look || 1) : look}) rotate(${tilt + pitchTilt * perch}deg)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    bee.dataset.ready = "true";
    return () => {
      cancelAnimationFrame(raf);
      document.querySelectorAll(".bee-here, .bee-tap").forEach((el) => el.classList.remove("bee-here", "bee-tap"));
    };
  }, []);

  return (
    <div ref={beeRef} aria-hidden="true" className="guide-bee pointer-events-none fixed top-0 left-0 z-40">
      <div ref={bodyRef} className="absolute">
        <svg width="52" height="40" viewBox="-34 -30 68 52" className="drop-shadow-[0_6px_8px_rgb(23_20_15/0.25)]">
          <g transform="rotate(-25)">
            <ellipse className="wing" cx="-4" cy="-13" rx="13" ry="9" fill="var(--bee-wing)" />
          </g>
          <ellipse cx="0" cy="0" rx="20" ry="13" fill="#F6B21B" />
          <path d={STRIPES} stroke="#17140F" strokeWidth="5" fill="none" />
          <circle cx="19" cy="0" r="8" fill="var(--bee-head)" />
        </svg>
      </div>
      <div ref={bubbleRef} data-show="false" data-side="right" data-pos="above" className="bee-bubble">
        Start here
      </div>
    </div>
  );
}
