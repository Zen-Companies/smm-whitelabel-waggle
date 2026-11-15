// Today, the home page (T71, design "1 · Today"): pure wording, tested next to it.

/** The chip on a message only the owner can answer: why it came to them, in plain words. */
export type ReasonChip =
  | "Upset customer"
  | "Couldn't send"
  | "Missed call"
  | "Voicemail"
  | "Not in your answers"
  | "Sent a photo"
  | "Not sure what they want"
  | "Wants to buy or book"
  | "For you";

export function reasonChip(entry: {
  status: string;
  kind: string;
  text: string;
  category: string | null;
  reviewRating?: number | null;
  reviewRecommends?: boolean | null;
  call?: { voicemail: boolean } | null;
  draft: { needsHuman: boolean } | null;
}): ReasonChip {
  if (entry.status === "failed") return "Couldn't send";
  if (entry.kind === "call") return entry.call?.voicemail ? "Voicemail" : "Missed call";
  const badReview =
    entry.kind === "review" &&
    ((entry.reviewRating != null && entry.reviewRating <= 2) || entry.reviewRecommends === false);
  if (entry.category === "complaint" || badReview) return "Upset customer";
  if (entry.draft?.needsHuman) return "Not in your answers";
  if (!entry.text.trim()) return "Sent a photo";
  if (entry.category === "unclear") return "Not sure what they want";
  if (entry.category === "lead") return "Wants to buy or book";
  return "For you";
}

/** Chips that are bad news get the danger tone; the rest stay calm. */
export const URGENT_CHIPS: ReadonlySet<ReasonChip> = new Set(["Upset customer", "Couldn't send"]);

const NOUNS: Record<ReasonChip, [string, string]> = {
  "Upset customer": ["upset customer", "upset customers"],
  "Couldn't send": ["reply that couldn't send", "replies that couldn't send"],
  "Missed call": ["missed call", "missed calls"],
  Voicemail: ["voicemail", "voicemails"],
  "Not in your answers": [
    "question your answers don't cover",
    "questions your answers don't cover",
  ],
  "Sent a photo": ["photo Waggle couldn't read", "photos Waggle couldn't read"],
  "Not sure what they want": ["unclear message", "unclear messages"],
  "Wants to buy or book": ["buyer to talk to", "buyers to talk to"],
  "For you": ["message for you", "messages for you"],
};

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = (n: number) => WORDS[n] ?? String(n);

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "One upset customer and one photo Waggle couldn't read." (largest groups first). */
export function onlyYouLine(chips: ReasonChip[]): string {
  if (!chips.length) return "Nothing needs you right now.";
  const tally = new Map<ReasonChip, number>();
  for (const c of chips) tally.set(c, (tally.get(c) ?? 0) + 1);
  const parts = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([chip, n]) => `${count(n)} ${NOUNS[chip][n === 1 ? 0 : 1]}`);
  const line = joinNames(parts);
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

/** "Maya wants a showing Saturday. Derek: selling his condo." from the newest leads. */
export function leadsLine(leads: { name: string | null; request: string | null }[]): string {
  if (!leads.length) return "No new leads since yesterday.";
  const shown = leads.slice(0, 2).map((l) => {
    const who = l.name?.trim() || "Someone";
    const what = l.request?.trim().replace(/[.!?]+$/, "");
    return what ? `${who}: ${what}.` : `${who} got in touch.`;
  });
  const more = leads.length > 2 ? ` And ${leads.length - 2} more.` : "";
  return shown.join(" ") + more;
}

/** "Since yesterday, Waggle answered 12 messages on its own and saved 2 new leads." */
export function sinceYesterdayLine(answered: number, leads: number): string {
  const msgs = answered === 1 ? "1 message" : `${answered} messages`;
  const ld = leads === 1 ? "1 new lead" : `${leads} new leads`;
  if (answered === 0 && leads === 0) return "Since yesterday, nothing new for Waggle to answer.";
  if (leads === 0) return `Since yesterday, Waggle answered ${msgs} on its own.`;
  return `Since yesterday, Waggle answered ${msgs} on its own and saved ${ld}.`;
}

/** "Good morning" by the viewer's local hour. */
export function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The first word of a full name, or null. */
export function firstName(full: unknown): string | null {
  if (typeof full !== "string") return null;
  const first = full.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

/** "just now", "5m ago", "2h ago", "3d ago". */
export function shortAgo(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** Typical reply time: "48s", "4m", "2h", or "–" with no replies. */
export function replyTime(seconds: number | null): string {
  if (seconds === null) return "–";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * Questions the owner's answers don't cover, the same question once with how often it was
 * asked, most asked first ("Do buyers pay you anything?" · asked 3 times).
 */
export function groupGaps(rows: { text: string }[], limit = 3): { text: string; times: number }[] {
  const groups = new Map<string, { text: string; times: number; order: number }>();
  rows.forEach((r, order) => {
    const text = r.text.trim();
    if (!text) return;
    const key = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const g = groups.get(key);
    if (g) g.times += 1;
    else groups.set(key, { text, times: 1, order });
  });
  return [...groups.values()]
    .sort((a, b) => b.times - a.times || a.order - b.order)
    .slice(0, limit)
    .map(({ text, times }) => ({
      text: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      times,
    }));
}
