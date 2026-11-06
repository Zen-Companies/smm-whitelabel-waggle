// Product mockups, built from what the Waggle app actually shows (Bayside Café pilot data). Kit colours only.
import { Mark } from "./brand";

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[1.75rem] border border-line bg-surface p-5 shadow-card sm:p-6 ${className}`}>{children}</div>
  );
}

function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "honey" | "hot" | "warn" | "ok" }) {
  const tones = {
    plain: "border border-line text-soft",
    honey: "bg-honey text-hive",
    hot: "bg-honey-glow text-hive",
    warn: "bg-ink text-bg",
    ok: "bg-[#b9a988] text-hive",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

// "Today" summary card from the app's home screen
export function TodayPanel() {
  return (
    <Panel className="w-full max-w-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-hive">
            <Mark size={20} trail="var(--honey)" />
          </span>
          <span className="font-semibold">Bayside Café</span>
        </div>
        <Pill tone="ok">● Live on 2 pages</Pill>
      </div>

      <div className="mt-5 rounded-2xl bg-honey p-5 text-hive">
        <div className="text-[0.7rem] font-bold tracking-[0.14em]">TODAY</div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {[
            ["38", "answered"],
            ["4", "for you"],
            ["11", "ignored"],
          ].map(([n, l]) => (
            <div key={l}>
              <div className="text-3xl font-bold tracking-tight">{n}</div>
              <div className="text-sm font-medium">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <span className="rounded-full bg-ink px-3.5 py-1.5 text-sm font-semibold text-bg">For you</span>
        <span className="rounded-full border border-line px-3.5 py-1.5 text-sm text-soft">Answered</span>
        <span className="rounded-full border border-line px-3.5 py-1.5 text-sm text-soft">Ignored</span>
      </div>

      <div className="mt-4 space-y-2.5">
        <div className="rounded-2xl border border-honey bg-surface-2 p-3.5">
          <div className="flex justify-between text-xs font-semibold text-muted">
            <span>FACEBOOK · Jen R.</span>
            <span className="text-accent">HOT LEAD</span>
          </div>
          <p className="mt-1.5 text-[0.95rem]">Can you cater 40 people this Friday? Need a quote.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
          <div className="flex justify-between text-xs font-semibold text-muted">
            <span>INSTAGRAM · @marco.eats</span>
            <span>ANSWERED · 6s</span>
          </div>
          <p className="mt-1.5 text-[0.95rem] text-soft">“Are you open Sunday?”</p>
          <p className="text-[0.95rem]">Yes! Sunday 8am to 2pm. See you there.</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-line p-3.5">
        <div>
          <div className="text-xs font-semibold text-muted">NEXT POST</div>
          <div className="text-[0.95rem]">Weekend brunch reel · 2 pages</div>
        </div>
        <span className="font-semibold text-accent">Sat 9:00</span>
      </div>
    </Panel>
  );
}

const EVENTS: Record<number, string> = {
  29: "New beans",
  31: "Halloween",
  1: "Weekend menu",
  5: "Latte art class",
  7: "Friday deal",
  8: "Market day",
};

export function CalendarPanel() {
  const days = [27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <Panel>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold">November</span>
        <span className="text-sm text-muted">3 scheduled · 9 published</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[0.7rem] font-semibold text-muted">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const ev = EVENTS[d];
          const past = i < 7;
          return (
            <div
              key={i}
              className={`flex aspect-[4/5] flex-col rounded-xl border p-1.5 text-left ${
                ev ? (past ? "border-line bg-surface-2" : "border-honey bg-honey-soft") : "border-line"
              }`}
            >
              <span className={`text-xs ${i < 5 ? "text-muted" : "font-semibold"}`}>{d}</span>
              {ev && <span className="mt-auto line-clamp-2 text-[0.6rem] leading-tight font-medium text-soft">{ev}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3.5">
        <p className="text-sm text-soft">Latte art class this Wednesday, 6pm. Six spots…</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            <Pill>Instagram</Pill>
            <Pill>Facebook</Pill>
          </div>
          <span className="rounded-full bg-honey px-3 py-1.5 text-xs font-semibold text-hive">Schedule for Wed 9:00 AM</span>
        </div>
      </div>
    </Panel>
  );
}

export function InboxPanel() {
  const rows = [
    { who: "carlo.m", t: "9:30", msg: "Table for 8 this Saturday, 7pm?", tag: "Lead · reply ready", tone: "hot" as const },
    { who: "jen.dc", t: "8:58", msg: "Waited 25 minutes and my coffee was cold.", tag: "Complaint · for you to answer", tone: "warn" as const },
    { who: "kenji.o", t: "8:20", msg: "Do you have oat milk?", tag: "Answered by Waggle in 6 s", tone: "ok" as const },
  ];
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">Inbox</span>
        <Pill tone="honey">3 things need you</Pill>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <div key={r.who} className="rounded-2xl border border-line bg-surface-2 p-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{r.who}</span>
              <span className="text-xs text-muted">{r.t}</span>
            </div>
            <p className="mt-1 text-[0.95rem] text-soft">{r.msg}</p>
            <div className="mt-2.5">
              <Pill tone={r.tone}>{r.tag}</Pill>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function LeadsPanel() {
  const leads = [
    ["Carlo M.", "Table for 8, Saturday 7pm", "Instagram DM"],
    ["Dana R.", "Birthday cake, 2 kg, Nov 12", "Facebook comment"],
    ["Miguel S.", "Catering for 30, asking for a quote", "Instagram DM"],
  ];
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">Leads</span>
        <span className="text-sm text-muted">This week</span>
      </div>
      <div className="mt-4 divide-y divide-line">
        {leads.map(([name, ask, src]) => (
          <div key={name} className="flex items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-honey-soft font-semibold text-accent">
              {name[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{name}</div>
              <div className="truncate text-sm text-soft">{ask}</div>
            </div>
            <span className="hidden text-xs text-muted sm:block">{src}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        Each new lead is emailed to you with the conversation.
      </p>
    </Panel>
  );
}

// The engine diagram: one figure-8, two loops. Left loop posts, right loop answers, the crossing is where buyers come out.
export function LoopDiagram() {
  return (
    <Panel className="relative overflow-hidden">
      <div className="grid grid-cols-3 text-center">
        {[
          ["Posted", "Calendar"],
          ["Answered", "Inbox"],
          ["Sold", "Leads"],
        ].map(([a, b], i) => (
          <div key={a} className="flex flex-col items-center gap-2">
            <span
              className={`grid size-14 place-items-center rounded-full text-lg font-bold ${
                i === 2 ? "bg-honey text-hive" : "border-2 border-honey text-accent"
              }`}
            >
              {i + 1}
            </span>
            <span className="font-semibold">{a}</span>
            <span className="text-xs text-muted">{b}</span>
          </div>
        ))}
      </div>
      <svg viewBox="-140 -70 280 140" className="mx-auto mt-4 w-full max-w-md" aria-hidden="true">
        <path
          d="M0,0 C30,-45 112,-58 112,0 C112,58 30,45 0,0 C-30,-45 -112,-58 -112,0 C-112,58 -30,45 0,0Z"
          fill="var(--honey-soft)"
          stroke="var(--honey)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <text x="-60" y="4" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink-soft)">
          You post once
        </text>
        <text x="60" y="4" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink-soft)">
          It answers all day
        </text>
        <circle cx="0" cy="0" r="7" fill="var(--hive)" stroke="var(--honey)" strokeWidth="3" />
      </svg>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Pill tone="honey">Your business info</Pill>
        <Pill tone="hot">Instagram</Pill>
        <Pill>Facebook</Pill>
      </div>
    </Panel>
  );
}
