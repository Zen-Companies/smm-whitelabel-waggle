import { Check } from "lucide-react";
import { BeeDance } from "@/components/app/bee";
import { cn } from "cn";

// What the bee found, pinned along the trail on wide screens; a wrapped row under it on phones.
// Positions are percentages of the 1120×300 scene. `data-flight="dance"` marks where the
// page-long flight path starts (flight-path.tsx).
const PILL =
  "border-line bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap";

export function Dance() {
  return (
    <div className="relative">
      <div data-flight="dance">
        <BeeDance />
      </div>
      <ul className="mt-4 flex list-none flex-wrap justify-center gap-2 md:absolute md:inset-0 md:mt-0 md:block">
        <li className={cn(PILL, "md:absolute md:top-[18%] md:left-[21%]")}>
          <span className="bg-honey size-1.5 rounded-full" aria-hidden />
          <b className="font-semibold">carlo.m</b>
          <span className="text-honey-text">wants a table for 8</span>
        </li>
        <li className={cn(PILL, "md:absolute md:top-[13%] md:left-[62%]")}>
          <Check className="text-success size-3.5" strokeWidth={2.4} aria-hidden />
          &ldquo;Open Sunday?&rdquo; answered in 6 s
        </li>
        <li className={cn(PILL, "md:absolute md:top-[44%] md:left-[43%]")}>
          <CalendarMark />
          Weekend menu <span className="text-ink-3">posted · Sat 9:00</span>
        </li>
        <li className={cn(PILL, "text-ink-4 md:absolute md:top-[74%] md:left-[68%]")}>
          &ldquo;10k followers fast!!&rdquo; hidden
        </li>
        <li className={cn(PILL, "md:absolute md:top-[76%] md:left-[18%]")}>
          <span className="text-danger font-medium">Complaint</span>
          for you
        </li>
      </ul>
    </div>
  );
}

function CalendarMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
