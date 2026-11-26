import { brandedEmail, brandedText, escapeHtml, honeyButton, paragraph } from "@/lib/email/frame";
import { isQuietWeek, quietLine } from "./copy";
import type { WeekSummary } from "./summary";

// The Monday email (board "Your week", approved 26 Nov): to the business's Owners after the Monday
// check-up, never after Check now. No customer names or messages, only the questions Waggle's
// answers don't cover. Pure, tested.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Topic labels as they read inside a sentence. */
const IN_SENTENCE: Record<string, string> = {
  "Wants to buy": "wanting to buy",
  "Not about your business": "other things",
};

function topicsSentence(topics: WeekSummary["topics"]): string | null {
  const words = topics
    .filter((t) => t.topic !== "spam" && t.topic !== "praise")
    .slice(0, 3)
    .map((t) => IN_SENTENCE[t.label] ?? t.label.toLowerCase());
  if (words.length === 0) return null;
  const list =
    words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
  return `People mostly asked about ${list}.`;
}

function numbersSentence(s: WeekSummary): string {
  const answered = s.answeredByWaggle + s.answeredByYou;
  const first = `${plural(s.cameIn, "message", "messages")} came in. Waggle and you answered ${answered}.`;
  const waiting =
    s.waiting === 0
      ? "None are waiting"
      : `${s.waiting} ${s.waiting === 1 ? "is" : "are"} still waiting`;
  const found =
    s.found > 0
      ? `, and Waggle found ${s.found} it had missed (${s.found === 1 ? "it's" : "they're"} in your Inbox now).`
      : ".";
  return `${first} ${waiting}${found}`;
}

export function weeklyEmail(input: {
  businessName: string;
  /** "23–29 Nov". */
  range: string;
  summary: WeekSummary;
  appUrl: string;
}): { subject: string; text: string; html: string } {
  const s = input.summary;
  const base = input.appUrl.replace(/\/+$/, "");
  const settingsUrl = `${base}/settings/notifications`;
  const because = `an Owner of ${input.businessName}`;
  const title = `${input.businessName} · ${input.range}`;
  const footer =
    "Every Monday after Waggle checks your week. Turn it off in Settings → Notifications.";
  const quiet = isQuietWeek(s);
  const gaps = quiet ? [] : s.gaps;

  const subject = quiet
    ? "Your week: a quiet one"
    : gaps.length
      ? `Your week: ${plural(s.cameIn, "message", "messages")}, ${plural(gaps.length, "question", "questions")} to answer`
      : `Your week: ${plural(s.cameIn, "message", "messages")}`;

  const button = gaps.length
    ? { href: `${base}/teach#questions`, label: "Write the answers" }
    : { href: `${base}/insights/work?period=7`, label: "See your week" };

  const lines: string[] = [];
  if (quiet) {
    lines.push(quietLine(s.cameIn));
  } else {
    lines.push(numbersSentence(s));
    const topics = topicsSentence(s.topics);
    if (topics) lines.push(topics);
  }
  const gapsLine = gaps.map((g) => `"${g.text}" (${g.times}×)`).join(" · ");

  const gapsHtml = gaps.length
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#FFF9EA;border:1px solid #F3DFA8;border-radius:12px;font-size:14px;line-height:1.55;color:#17140F"><b>Waggle couldn't answer these:</b><br>${gaps
        .map((g) => `&ldquo;${escapeHtml(g.text)}&rdquo; (${g.times}&times;)`)
        .join(" &middot; ")}</div>`
    : "";
  const html = brandedEmail({
    title,
    bodyHtml:
      lines.map((l) => paragraph(l)).join("") +
      gapsHtml +
      `<div style="margin:4px 0 20px">${honeyButton(button.href, button.label)}</div>` +
      paragraph(footer, { muted: true }),
    button: null,
    businessName: input.businessName,
    because,
    settingsUrl,
    preheader: lines[0],
  });
  const text = brandedText({
    title,
    lines: [
      ...lines.flatMap((l) => [l, ""]),
      ...(gaps.length ? ["Waggle couldn't answer these:", gapsLine, ""] : []),
      `${button.label}: ${button.href}`,
      "",
      footer,
    ],
    because,
    settingsUrl,
  });
  return { subject, text, html };
}
