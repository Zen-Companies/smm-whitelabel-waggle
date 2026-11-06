import Link from "next/link";
import { Mark } from "../../components/brand";
import { LOGOS } from "../../components/platforms";
import type { Category, Platform, ReplyMode } from "./data";

const ICONS = {
  today: "M3 11 12 3l9 8M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5M10 21v-6h4v6",
  inbox: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
  posts: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  leads: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  analytics: "M4 20V10M12 20V4M20 20v-7",
  info: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  lab: "M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9",
  settings: "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4M16 4v4M8 10v4M14 16v4",
  more: "M4 6h16M4 12h16M4 18h16",
  back: "m15 18-6-6 6-6",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  check: "m5 12 5 5 9-10",
  close: "M18 6 6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
} as const;

export function Icon({ name, size = 18, weight = 1.5 }: { name: keyof typeof ICONS; size?: number; weight?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Every screen opens the same way: what it is, in plain words, and its one main action.
export function PageHead({ title, about, action }: { title: string; about: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-soft">{about}</p>
      </div>
      {action}
    </header>
  );
}

// Below desktop a form opens full screen from a button instead of waiting at the bottom of a long page.
export const sheetForm = (open: boolean) =>
  open ? "max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:h-dvh max-lg:self-auto max-lg:overflow-y-auto max-lg:rounded-none max-lg:border-0 max-lg:bg-bg max-lg:pb-0" : "max-lg:hidden";

// Thumb rule: below desktop, the controls you use most sit in a bar right above the tab bar.
// The extra bottom padding clears the raised centre button, which stands 28px above the tab bar with its ring.
export const thumbDock = "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[var(--tabbar)] max-lg:z-30 max-lg:mt-0 max-lg:mb-0 max-lg:rounded-none max-lg:border-x-0 max-lg:border-t max-lg:border-b-0 max-lg:border-line max-lg:bg-bg max-lg:px-3 max-lg:py-1.5 max-lg:pb-7";
// A form's actions stay pinned to the bottom edge while it scrolls.
export const sheetFooter = "flex flex-wrap items-center gap-2 max-lg:sticky max-lg:bottom-0 max-lg:-mx-5 max-lg:mt-auto max-lg:flex-nowrap max-lg:border-t max-lg:border-line max-lg:bg-bg max-lg:px-5 max-lg:pt-3 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]";
export const fab = `inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-honey px-5 text-[15px] font-semibold text-hive shadow-card fixed right-4 z-30 lg:hidden`;

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-honey px-5 text-[15px] font-semibold text-hive transition hover:bg-honey-glow disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-edge px-5 text-[15px] font-semibold text-ink transition hover:border-honey disabled:cursor-not-allowed disabled:opacity-50";
export const btnQuiet = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-[15px] font-medium text-soft transition hover:text-ink";
export const field =
  "w-full rounded-[12px] border border-edge bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted focus:border-honey max-lg:text-base focus:outline-none";
export const card = "rounded-[18px] border border-line bg-surface";

export function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "lead" | "alert" }) {
  const tones = { plain: "border border-line text-soft", lead: "bg-honey-glow text-hive", alert: "bg-ink text-bg" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function NextStep({ category, draft }: { category: Category; draft?: boolean }) {
  if (category === "lead") return <Pill tone="lead">Buyer · reply ready</Pill>;
  if (category === "complaint") return <Pill tone="alert">Complaint · for you to answer</Pill>;
  if (category === "unknown") return <Pill>Not in your info · for you</Pill>;
  return <Pill>{draft ? "Question · reply ready" : "Question"}</Pill>;
}

export function PlatformTag({ platform, kind }: { platform: Platform; kind?: string }) {
  return (
    <span className="text-[13px] text-muted">
      {platform}
      {kind ? ` ${kind}` : ""}
    </span>
  );
}

// A platform's own logo on a white tile, so black and coloured marks stay correct in both themes.
export function PlatformLogo({ platform, small = false }: { platform: Platform; small?: boolean }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center border border-line bg-white ${small ? "size-7 rounded-lg [&>svg]:size-4" : "size-11 rounded-xl"}`}>
      {LOGOS.find((l) => l.name === platform)?.icon}
    </span>
  );
}

// Instagram's gradient. The homepage defines its own, so the system needs this one copy.
export function PlatformLogoDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <radialGradient id="ig-grad" cx="0.3" cy="1.07" r="1.3">
          <stop offset="0" stopColor="#fd5" />
          <stop offset="0.1" stopColor="#fd5" />
          <stop offset="0.5" stopColor="#ff543e" />
          <stop offset="1" stopColor="#c837ab" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className={`${card} flex flex-col items-center px-6 py-14 text-center`}>
      <Mark size={72} bee />
      <h2 className="mt-5 text-xl font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md text-[15px] text-soft">{body}</p>
      {href && cta && (
        <Link href={href} className={`mt-5 ${btnPrimary}`}>
          {cta}
        </Link>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, label, className = "" }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[]; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 overflow-x-auto border-b border-line ${thumbDock} max-lg:justify-around max-lg:px-1 max-lg:py-0 ${className}`}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`-mb-px min-h-11 border-b-2 px-3 text-[15px] whitespace-nowrap transition ${value === o.id ? "border-ink font-semibold text-ink" : "border-transparent text-soft hover:text-ink"}`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-[13px] font-normal text-muted tabular-nums">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-cream p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`min-h-11 rounded-full px-3.5 text-sm whitespace-nowrap lg:min-h-9 transition ${value === o.id ? "bg-surface font-semibold text-ink shadow-sm" : "text-soft hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const MODE_OPTIONS: { id: ReplyMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "ask", label: "Ask me first" },
  { id: "auto", label: "Auto-reply" },
];

export function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-[13px] text-soft">{note}</div>}
    </div>
  );
}
