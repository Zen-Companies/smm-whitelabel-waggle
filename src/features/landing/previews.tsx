import { Check, Clock, Mail, UserRound } from "lucide-react";
import { cn } from "cn";

// Small, static pictures of the product for the landing page. Made of the same rows and tokens as
// the app (docs/design.md §4) and unboxed like it (rule 1), so they look like the real thing
// because they nearly are.

/** Posts: a month calendar with published and scheduled chips, and the composer under it. */
export function CalendarPreview() {
  const days: { n: number; faded?: boolean; today?: boolean; post?: string; done?: boolean }[] = [
    { n: 27, faded: true },
    { n: 28, faded: true },
    { n: 29, faded: true, post: "New beans", done: true },
    { n: 30, faded: true },
    { n: 31, faded: true, post: "Halloween", done: true },
    { n: 1, post: "Weekend menu", done: true },
    { n: 2 },
    { n: 3, today: true },
    { n: 4 },
    { n: 5, post: "Latte art class" },
    { n: 6 },
    { n: 7, post: "Friday deal" },
    { n: 8, post: "Market day" },
    { n: 9 },
  ];
  return (
    <div
      role="img"
      aria-label="The Posts calendar: a month of published and scheduled posts, with the composer"
      className="flex min-w-0 flex-col gap-2.5 text-[13px]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold">November</span>
        <span className="text-ink-3">3 scheduled · 9 published</span>
      </div>
      <div className="text-ink-4 grid grid-cols-7 gap-1 text-center text-[11px]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid auto-rows-[48px] grid-cols-7 gap-1">
        {days.map((d) => (
          <span
            key={d.n}
            className={cn(
              "border-line flex min-w-0 flex-col gap-1 overflow-hidden border-t px-0.5 pt-1",
              d.faded && "text-ink-3",
            )}
          >
            {d.today ? (
              <span className="bg-ink text-page inline-flex size-[18px] items-center justify-center rounded-full text-[11px]">
                {d.n}
              </span>
            ) : (
              d.n
            )}
            {d.post && (
              <span
                className={cn(
                  "text-ink inline-flex items-center gap-1 truncate rounded px-1 py-px text-[11px]",
                  d.done ? "bg-subtle" : "border-line-strong border",
                )}
              >
                {d.done ? (
                  <Check className="text-success size-2.5 shrink-0" strokeWidth={3} aria-hidden />
                ) : (
                  <Clock className="text-ink-2 size-2.5 shrink-0" strokeWidth={2.4} aria-hidden />
                )}
                <span className="truncate">{d.post}</span>
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="border-line mt-0.5 flex items-center gap-2.5 border-t pt-3">
        <span className="bg-subtle size-9 shrink-0 rounded-md" />
        <span className="text-ink-2 min-w-0 flex-1 truncate">
          Latte art class this Wednesday, 6pm. Six spots…
        </span>
        <span className="bg-honey rounded-md px-3 py-1.5 font-semibold whitespace-nowrap">
          Schedule for Wed 9:00 AM
        </span>
      </div>
    </div>
  );
}

/** The inbox: "3 things need you" and three rows with rule 4's three lines. */
export function InboxPreview() {
  return (
    <div
      role="img"
      aria-label="The inbox: three messages that need you, each with what happens next"
      className="border-line flex min-w-0 flex-col border-b text-[15px]"
    >
      <span className="mb-2 text-xl font-semibold tracking-[-0.02em]">3 things need you</span>
      <Row name="carlo.m" time="9:30" needsYou text="Table for 8 this Saturday, 7pm?">
        <span className="text-honey-text font-medium">Lead</span> · reply ready
      </Row>
      <Row name="jen.dc" time="8:58" needsYou text="Waited 25 minutes and my coffee was cold.">
        <span className="text-danger font-medium">Complaint</span> · for you to answer
      </Row>
      <Row name="kenji.o" time="8:20" text="Do you have oat milk?" handled>
        <span className="inline-flex items-center gap-1.5">
          <Check className="text-success size-3" strokeWidth={2.6} aria-hidden />
          Answered by Waggle in 6 s
        </span>
      </Row>
    </div>
  );
}

function Row({
  name,
  time,
  text,
  needsYou,
  handled,
  children,
}: {
  name: string;
  time: string;
  text: string;
  needsYou?: boolean;
  handled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("border-line flex gap-3 border-t py-3", handled && "text-ink-3")}>
      <span className="bg-subtle flex size-8 shrink-0 items-center justify-center rounded-full">
        <UserRound className="text-ink-3 size-4" strokeWidth={1.5} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          {needsYou && <span className="bg-honey size-1.5 rounded-full" aria-hidden />}
          <span className={cn(needsYou && "font-semibold")}>{name}</span>
          <span className="text-ink-3 ml-auto text-[13px] tabular-nums">{time}</span>
        </span>
        <span className={cn(!handled && "text-ink-2")}>{text}</span>
        <span className={cn("text-[13px]", !handled && "text-ink-3")}>{children}</span>
      </span>
    </span>
  );
}

/** Leads: who, what they asked for, where. */
export function LeadsPreview() {
  const leads = [
    ["Carlo M.", "Table for 8, Saturday 7pm", "Instagram DM"],
    ["Dana R.", "Birthday cake, 2 kg, Nov 12", "Facebook comment"],
    ["Miguel S.", "Catering for 30, asking for a quote", "Instagram DM"],
  ] as const;
  return (
    <div
      role="img"
      aria-label="The Leads list: three customers with what they asked for"
      className="border-line border-t text-sm"
    >
      {leads.map(([who, what, where]) => (
        <div
          key={who}
          className="border-line grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)] gap-3 border-b py-3.5"
        >
          <b className="font-semibold">{who}</b>
          <span className="text-ink-2">{what}</span>
          <span className="text-ink-3 text-right">{where}</span>
        </div>
      ))}
      <div className="text-ink-2 flex items-center gap-2 py-3.5">
        <Mail className="text-ink-3 size-4" strokeWidth={1.8} aria-hidden />
        Each new lead is emailed to you with the conversation.
      </div>
    </div>
  );
}
