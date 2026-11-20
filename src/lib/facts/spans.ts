// Walter's flow (decision 7, 20 Nov): which parts of a reply come from a business-info fact.
// Pure. Used to highlight not-checked facts in a draft (setup step 3, the inbox) and to decide
// which not-checked facts a sent reply used (those become checked).
//
// A fact's "tokens" are the things a customer could be misled by: amounts and other numbers,
// times, phone numbers, emails and links. A reply uses a fact when one of its tokens is in the
// reply. A fact with none of them (a plain answer, "Yes, we deliver within Makati") is used when
// most of its words are in the reply; it gets no highlight.

export type FactTokenKind = "number" | "phone" | "email" | "link";

export interface FactToken {
  kind: FactTokenKind;
  /** The text as written. */
  text: string;
  /** The comparable form: digits for phones, no thousands separators, lower case. */
  norm: string;
  start: number;
  end: number;
}

export interface FactSpan {
  start: number;
  end: number;
  text: string;
}

export interface FactText {
  title: string;
  content: string;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[\w\-./?=&#%]*)?/gi;
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;
const NUMBER = /(?<![\d.,:])(?:\d{1,3}(?:,\d{3})+|\d+)(?:[.:]\d+)?(?:\s?(?:am|pm)\b)?(?!\d)/gi;

const PHONE_MIN_DIGITS = 7;

function linkNorm(text: string): string {
  return text
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/.?#]+$/, "");
}

function numberNorm(text: string): string {
  const n = text.toLowerCase().replace(/[,\s]/g, "");
  // 4.50 and 4.5 are the same amount; 9:00 stays a time.
  return n.replace(/^(\d+)\.(\d*?)0+(?=$|am|pm)/, (_, a: string, b: string) =>
    b ? `${a}.${b}` : a,
  );
}

/** Masks a match so later patterns can't see it, keeping every position. */
function mask(text: string, start: number, end: number): string {
  return text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
}

export function factTokens(text: string): FactToken[] {
  const tokens: FactToken[] = [];
  let rest = text;
  const take = (
    re: RegExp,
    kind: FactTokenKind,
    norm: (s: string) => string | null,
    trim?: (s: string) => string,
  ) => {
    for (const m of [...rest.matchAll(re)]) {
      const raw = trim ? trim(m[0]) : m[0];
      const start = m.index;
      const end = start + raw.length;
      const n = norm(raw);
      rest = mask(rest, start, end);
      if (n) tokens.push({ kind, text: raw, norm: n, start, end });
    }
  };
  take(EMAIL, "email", (s) => s.toLowerCase());
  take(LINK, "link", linkNorm, (s) => s.replace(/[.,)]+$/, ""));
  take(PHONE, "phone", (s) => {
    const d = s.replace(/\D/g, "");
    return d.length >= PHONE_MIN_DIGITS ? d : null;
  });
  take(NUMBER, "number", (s) => {
    const n = numberNorm(s);
    // A lone digit ("3 tables") is too common to tie a reply to a fact.
    return /am|pm/.test(n) || n.replace(/\D/g, "").length >= 2 ? n : null;
  });
  return tokens.sort((a, b) => a.start - b.start);
}

function samePhone(a: string, b: string): boolean {
  const n = Math.min(10, a.length, b.length);
  return n >= PHONE_MIN_DIGITS && a.slice(-n) === b.slice(-n);
}

function sameToken(fact: FactToken, reply: FactToken): boolean {
  if (fact.kind !== reply.kind) return false;
  return fact.kind === "phone" ? samePhone(fact.norm, reply.norm) : fact.norm === reply.norm;
}

/** Where the fact's tokens appear in the reply, in reply order. */
export function factSpans(reply: string, fact: FactText): FactSpan[] {
  const wanted = factTokens(`${fact.title}\n${fact.content}`);
  if (wanted.length === 0) return [];
  return factTokens(reply)
    .filter((r) => wanted.some((w) => sameToken(w, r)))
    .map((r) => ({ start: r.start, end: r.end, text: r.text }));
}

const STOPWORDS = new Set(
  (
    "about also always because been before being could does doing from have here into just " +
    "like make more most only other over please same should some such than that their them " +
    "then there these they this those through very want were what when where which while " +
    "will with would your yours thanks thank hello"
  ).split(" "),
);

function keyWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((w) => !STOPWORDS.has(w)));
}

/**
 * Whether the reply uses the fact. With tokens: one of them is in the reply. Without: at least
 * two of its key words, and at least half of them, are in the reply.
 */
export function factUsed(reply: string, fact: FactText): boolean {
  const text = `${fact.title}\n${fact.content}`;
  if (factTokens(text).length > 0) return factSpans(reply, fact).length > 0;
  const words = keyWords(text);
  if (words.size < 2) return false;
  const inReply = keyWords(reply);
  const found = [...words].filter((w) => inReply.has(w)).length;
  return found >= 2 && found * 2 >= words.size;
}
