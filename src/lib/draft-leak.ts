// A draft reply that carries the draft schema's own fields (hotfix 26 Nov): a free model put
// `needsHuman: false reason: null lead: null}{` inside the reply string, and it was sent. Pure.
// Used when a draft is written (features/drafting: clean it, hand it to the owner) and when a
// reply is approved or sent (features/approvals: refuse a body that still has them).

/** The fields of drafting's `draftOutputSchema`. */
const KEYS = "needsHuman|needs_human|reason|lead|reply";
const KEY_RE = new RegExp(`(\\{\\s*)?(["']?)\\b(${KEYS})\\b\\2\\s*[:=]\\s*`, "gi");
const JSON_WORD_RE = /^(null|true|false)\b/i;

interface Marker {
  index: number;
  strong: boolean;
}

/**
 * Where the schema's structure shows up in the text. Strong markers are never legit reply text;
 * weak ones (`reason: "…"`, `lead: {…`) only count next to another marker, so "The reason: we
 * close at 5" stays as written.
 */
function findMarkers(text: string): Marker[] {
  const markers: Marker[] = [];
  for (const m of text.matchAll(KEY_RE)) {
    const brace = !!m[1];
    const quoted = !!m[2];
    const key = m[3]!;
    const value = text.slice(m.index + m[0].length);
    const needsHumanKey = /^needs_?human$/i.test(key);
    if (needsHumanKey || brace || quoted || JSON_WORD_RE.test(value)) {
      markers.push({ index: m.index, strong: true });
    } else if (/^["{[]/.test(value)) {
      markers.push({ index: m.index, strong: false });
    }
  }
  const joined = text.indexOf("}{");
  if (joined >= 0) markers.push({ index: joined, strong: true });
  const fence = text.indexOf("```");
  if (fence >= 0) markers.push({ index: fence, strong: true });
  // A brace left over at the end: only when the braces don't pair up ("{SAVE10}" is fine).
  const open = (text.match(/\{/g) ?? []).length;
  const close = (text.match(/\}/g) ?? []).length;
  const tail = /[{}][\s"',]*$/.exec(text);
  if (tail && open !== close) markers.push({ index: tail.index, strong: true });
  return markers;
}

/** The reply from a whole JSON answer (`{"reply":"…", …}`, maybe fenced), or null. */
function replyFromJson(text: string): string | null {
  const unfenced = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  if (!unfenced.startsWith("{")) return null;
  const end = unfenced.lastIndexOf("}");
  if (end > 0) {
    try {
      const parsed: unknown = JSON.parse(unfenced.slice(0, end + 1));
      if (parsed && typeof parsed === "object" && "reply" in parsed) {
        const reply = (parsed as { reply: unknown }).reply;
        if (typeof reply === "string" && reply.trim()) return reply.trim();
      }
    } catch {
      // Not whole JSON: read the reply's string by hand below.
    }
  }
  const m = /^\{\s*"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(unfenced);
  if (!m) return null;
  try {
    const reply = JSON.parse(`"${m[1]}"`) as string;
    return reply.trim() || null;
  } catch {
    return null;
  }
}

/** Trailing separators left after a cut: spaces, commas, an unpaired quote. */
function tidy(text: string): string {
  let out = text.replace(/[\s,;]+$/, "");
  if ((out.match(/"/g) ?? []).length % 2 === 1) out = out.replace(/"\s*$/, "").trimEnd();
  return out.trim();
}

export interface LeakCleanup {
  /** The reply without the leaked structure (the text as given when nothing was found). */
  reply: string;
  /** True when something was removed. */
  cleaned: boolean;
}

/**
 * Removes the draft schema's fields and JSON pieces from a reply: a whole JSON answer gives its
 * `reply` value; otherwise the reply is cut at the first leak. When nothing would be left, the
 * text comes back as given with `cleaned` true (the caller hands it to the owner).
 */
export function cleanLeakedReply(text: string): LeakCleanup {
  const original = text.trim();
  const fromJson = replyFromJson(original);
  if (fromJson !== null) return { reply: cleanLeakedReply(fromJson).reply, cleaned: true };

  // A leading `reply:` label is dropped rather than cut at (the text after it is the reply).
  let body = original;
  let stripped = false;
  const lead = /^\s*\{?\s*(["']?)reply\1\s*[:=]\s*"?/i.exec(body);
  if (lead) {
    const rest = body.slice(lead[0].length);
    const labelIsStructure = /^\s*\{|^\s*["']/.test(lead[0]) || findMarkers(rest).length > 0;
    if (labelIsStructure) {
      body = rest;
      stripped = true;
    }
  }

  const markers = findMarkers(body);
  const strong = markers.some((m) => m.strong);
  if (!strong && markers.length < 2) {
    return stripped
      ? { reply: tidy(body) || original, cleaned: true }
      : { reply: original, cleaned: false };
  }
  const cut = Math.min(...markers.map((m) => m.index));
  const reply = tidy(body.slice(0, cut));
  return { reply: reply || original, cleaned: true };
}

/** True when a reply still has the draft schema's fields in it (send-time guard). */
export function hasLeakedFields(text: string): boolean {
  return cleanLeakedReply(text).cleaned;
}

/** The note on a draft that had to be cleaned: it goes to the owner, never out on its own. */
export const GARBLED_DRAFT_REASON =
  "The AI's answer came back garbled; Waggle cleaned it — check it before sending.";
