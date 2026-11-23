import { cn } from "cn";
import { BeeBody } from "./bee";

// The bee in "Get Waggle ready", steps 3 to 5 and the finish (approved 17 Nov, canvas
// "Onboarding · Setup fixes and the bee"; design.md §6). Small, beside the form, a few seconds of
// motion then rest; reduced motion shows them drawn and still (globals.css).

const INK = "var(--ink)";
const HONEY = "var(--honey)";

/** The figure-8 in a 240×120 box (the waggle dance). */
const FIGURE_8 =
  "M120,60 C138,30 204,24 204,60 C204,96 138,90 120,60 C102,30 36,24 36,60 C36,96 102,90 120,60Z";

function FlyingBee({
  path,
  className,
  seconds,
}: {
  path: string;
  className: string;
  seconds?: number;
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        width: 24,
        height: 16,
        margin: "-8px 0 0 -12px",
        offsetPath: `path("${path}")`,
        animationDuration: seconds ? `${seconds}s` : undefined,
      }}
    >
      <svg width="24" height="16" viewBox="0 0 24 16">
        <BeeBody />
      </svg>
    </span>
  );
}

/** A trail along the figure-8, dotted, with honey drawn over it once. */
function Trail({ honey = false }: { honey?: boolean }) {
  return (
    <svg width="240" height="120" viewBox="0 0 240 120" className="absolute inset-0">
      <path
        d={FIGURE_8}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="2"
        strokeDasharray="2 5"
        strokeLinecap="round"
      />
      {honey && (
        <path
          d={FIGURE_8}
          pathLength={100}
          fill="none"
          stroke={HONEY}
          strokeWidth="2.5"
          strokeLinecap="round"
          className="bee-trace-slow"
        />
      )}
    </svg>
  );
}

/**
 * The waggle dance, flown `times` times (the finish flies it once and rests where it started;
 * "On its own" in step 5 loops while picked). `scale` shrinks the 240×120 box.
 */
export function BeeDance({
  times = 1,
  scale = 1,
  className,
}: {
  times?: number | "loop";
  scale?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("relative block shrink-0", className)}
      style={{ width: 240 * scale, height: 120 * scale }}
    >
      <span
        className="absolute top-0 left-0 block h-[120px] w-[240px] origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        <Trail honey={times !== "loop"} />
        <FlyingBee
          path={FIGURE_8}
          className={times === "loop" ? "bee-fly" : "bee-fly-once"}
          seconds={times === "loop" ? 4 : 2.6}
        />
      </span>
    </span>
  );
}

const CELLS = [
  { x: 30, y: 6 },
  { x: 56, y: 6 },
  { x: 43, y: 30 },
];

/**
 * Step 3, "Waggle learns": three honeycomb cells, one filled per answer written; the bee hops on
 * the newest. At three, the comb is full and the bee flies a small figure-8 once.
 */
export function BeeHoneycomb({ filled }: { filled: number }) {
  const full = filled >= CELLS.length;
  const on = Math.min(filled, CELLS.length);
  const perch = CELLS[Math.max(0, on - 1)];
  return (
    <span aria-hidden className="relative block h-[84px] w-[110px]">
      <svg width="110" height="84" viewBox="0 0 110 84" className="absolute inset-0">
        {CELLS.map((c, i) => (
          <path
            key={i}
            d={`M${c.x} ${c.y}l12 7v14l-12 7-12-7V${c.y + 7}z`}
            fill={i < on ? HONEY : "var(--surface)"}
            stroke={INK}
            strokeWidth="1.4"
            strokeLinejoin="round"
            className="transition-[fill] duration-500"
          />
        ))}
      </svg>
      {full ? (
        <span className="absolute -top-3 -left-8 block h-[120px] w-[240px] origin-top-left scale-[0.5]">
          <FlyingBee path={FIGURE_8} className="bee-fly-once" seconds={2.2} />
        </span>
      ) : (
        <span
          className="bee-bob absolute transition-[left,top] duration-500"
          style={{ left: perch.x - 4 + (on ? 0 : 40), top: perch.y - 14 + (on ? 0 : 40) }}
        >
          <svg width="24" height="16" viewBox="0 0 24 16">
            <BeeBody />
          </svg>
        </span>
      )}
    </span>
  );
}

/** Step 4, while Waggle writes: the bee carries the message across, from the customer to the reply. */
export function BeeCarrying({ className }: { className?: string }) {
  const arc = "M8,46 C70,-6 190,-6 252,30";
  return (
    <span aria-hidden className={cn("relative block h-[56px] w-[260px] shrink-0", className)}>
      <svg width="260" height="56" viewBox="0 0 260 56" className="absolute inset-0">
        <path
          d={arc}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
      </svg>
      <FlyingBee path={arc} className="bee-carry" />
    </span>
  );
}

/** Step 4's three tries as honeycomb marks, filled as they're used. */
export function TryCombs({ done, of }: { done: number; of: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: of }, (_, i) => (
        <svg key={i} width="16" height="18" viewBox="0 0 14 16">
          <path
            d="M7 1 13 4.5v7L7 15 1 11.5v-7Z"
            fill={i < done ? HONEY : "var(--surface)"}
            stroke={INK}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

/** Step 5, "Ask me first": the bee waits by a Send button. Moves only while the choice is picked. */
export function BeeBySend() {
  return (
    <span aria-hidden className="choice-bee flex h-[60px] items-center justify-center gap-2.5">
      <span className="bee-bob inline-block">
        <svg width="32" height="22" viewBox="0 0 24 16">
          <BeeBody />
        </svg>
      </span>
      <span className="bg-honey text-ink rounded-md px-2.5 py-1 text-xs font-semibold">Send</span>
    </span>
  );
}

/** Step 5, "Reply on its own": the bee flies its figure-8. Moves only while the choice is picked. */
export function BeeOnItsOwn() {
  return (
    <span aria-hidden className="choice-bee flex h-[60px] items-center justify-center">
      <BeeDance times="loop" scale={0.5} />
    </span>
  );
}

/**
 * Setup step 3, the customers still waiting (approved 21 Nov): one honeycomb cell per customer,
 * filled as you answer; the bee hops onto the newest filled cell.
 */
export function AnswerCombs({ done, of }: { done: number; of: number }) {
  const cells = Math.min(of, 10);
  const on = Math.min(done, cells);
  const perch = Math.max(0, on - 1);
  return (
    <span aria-hidden className="relative inline-block pt-4" style={{ width: cells * 18 + 8 }}>
      <span className="flex items-center gap-0.5">
        {Array.from({ length: cells }, (_, i) => (
          <svg key={i} width="18" height="20" viewBox="0 0 14 16">
            <path
              d="M7 1 13 4.5v7L7 15 1 11.5v-7Z"
              fill={i < on ? HONEY : "var(--surface)"}
              stroke={INK}
              strokeWidth="1.1"
              strokeLinejoin="round"
              className="transition-[fill] duration-500"
            />
          </svg>
        ))}
      </span>
      <span
        className="bee-bob absolute top-0 transition-[left] duration-500"
        style={{ left: on ? perch * 18 - 2 : -6 }}
      >
        <svg width="22" height="15" viewBox="0 0 24 16">
          <BeeBody />
        </svg>
      </span>
    </span>
  );
}

/**
 * "Ask me first" (approved 21 Nov): the bee holds the written reply by your phone and waits, while
 * the Send button breathes. You send it. Moves only while the choice is picked.
 */
export function BeeHandsYouSend() {
  return (
    <span aria-hidden className="choice-bee flex h-[60px] items-center gap-2">
      <span className="bee-bob relative inline-block">
        <svg width="30" height="20" viewBox="0 0 24 16">
          <BeeBody />
        </svg>
        <span className="bg-honey-tint border-honey-border absolute top-3 -right-3 h-2.5 w-4 rounded-[3px] border" />
      </span>
      <span className="border-line-strong bg-surface flex h-[52px] w-9 flex-col items-center justify-end rounded-lg border p-1">
        <span className="bg-honey send-pulse text-ink rounded px-1 text-[8px] leading-[12px] font-bold">
          Send
        </span>
      </span>
    </span>
  );
}

/**
 * "Reply on its own" (approved 21 Nov): the bee grabs the reply and flies it out along the dotted
 * path to the customer's chat, which shows ✓ Sent. Moves only while the choice is picked.
 */
export function BeeFliesItOut() {
  const arc = "M6,44 C40,0 90,0 120,26";
  return (
    <span aria-hidden className="choice-bee relative block h-[60px] w-[176px]">
      <svg width="176" height="60" viewBox="0 0 176 60" className="absolute inset-0">
        <path
          d={arc}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
      </svg>
      <FlyingBee path={arc} className="bee-carry" />
      <span className="bg-subtle text-success absolute top-[30px] left-[122px] rounded-full px-2 text-[10px] leading-[18px] font-semibold">
        ✓ Sent
      </span>
    </span>
  );
}
