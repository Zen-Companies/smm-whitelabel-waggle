// The Leads board (T74d, design "4 · Leads"): New → Talking → Booked → Done. Pure; tested.
import { leadReplied } from "./lead-status";

export const LEAD_STAGES = [
  { key: "new", title: "New", hint: "Came in, not answered yet" },
  { key: "talking", title: "Talking", hint: "You or Waggle replied" },
  { key: "booked", title: "Booked", hint: "Booking or call on the calendar" },
  { key: "done", title: "Done", hint: "Bought, sold or not a fit" },
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number]["key"];

export const isLeadStage = (v: unknown): v is LeadStage => LEAD_STAGES.some((s) => s.key === v);

/** Where a lead shows: where the owner put it, else New until someone replied, then Talking. */
export function leadStage(stage: string | null, itemStatus: string): LeadStage {
  if (isLeadStage(stage)) return stage;
  return leadReplied(itemStatus) ? "talking" : "new";
}

/** The one move the card offers. Done offers going back to Talking. */
export function nextStage(stage: LeadStage): LeadStage {
  return stage === "new"
    ? "talking"
    : stage === "talking"
      ? "booked"
      : stage === "booked"
        ? "done"
        : "talking";
}

export function moveLabel(stage: LeadStage): string {
  const to = nextStage(stage);
  return stage === "done"
    ? "Back to Talking"
    : `Move to ${LEAD_STAGES.find((s) => s.key === to)!.title}`;
}

/** What's next for this lead, in owner words (null when nothing is waiting). */
export function nextLine(itemStatus: string): string | null {
  if (itemStatus === "awaiting_approval") return "Your reply is waiting in the Inbox";
  if (itemStatus === "escalated" || itemStatus === "failed") return "Needs you in the Inbox";
  if (itemStatus === "new" || itemStatus === "processing") return "Waggle is writing a reply";
  return null;
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Formula-looking values are prefixed so spreadsheets show them as text. */
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** "Download list": one row per lead, the columns an owner pastes into a CRM. */
export function leadsCsv(
  rows: {
    createdAt: string;
    name: string;
    contact: string | null;
    wants: string | null;
    stage: LeadStage;
    source: string;
  }[],
): string {
  const head = ["Date", "Name", "Contact", "Wants", "Stage", "Came from"];
  const lines = rows.map((r) =>
    [
      r.createdAt.slice(0, 10),
      r.name,
      r.contact ?? "",
      r.wants ?? "",
      LEAD_STAGES.find((s) => s.key === r.stage)!.title,
      r.source,
    ]
      .map((v) => cell(safe(v)))
      .join(","),
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
