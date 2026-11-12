// WhatsApp templates (T67): Meta's own format, kept out of the screens. Owners write "[name]";
// Meta wants positional {{1}} with an example value for its reviewers.

export type TemplateStatus =
  "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "IN_APPEAL" | "PENDING_DELETION";

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  status: TemplateStatus | string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION" | string;
  /** The body text with Meta's {{1}} placeholders, or "" when the template has none. */
  body: string;
  /** How many {{n}} placeholders the body has. */
  variables: number;
}

/** The body text of a template's components (Meta returns `type: "BODY"`). */
export function bodyOf(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const body = components.find(
    (c) =>
      c && typeof c === "object" && String((c as { type?: unknown }).type).toUpperCase() === "BODY",
  ) as { text?: unknown } | undefined;
  return typeof body?.text === "string" ? body.text : "";
}

/** The highest {{n}} in a body: Meta numbers them 1, 2, 3 in order. */
export function variableCount(body: string): number {
  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/** The text the customer will see, with the values filled in. */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (all, n: string) => params[Number(n) - 1] ?? all);
}

/** "Order ready for pickup" → "order_ready_for_pickup" (Meta: lowercase, digits, _, a letter first). */
export function templateNameFrom(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60);
  return /^[a-z]/.test(slug) ? slug : `t_${slug}`.slice(0, 60);
}

/** "Order ready for pickup" back from the name, for lists. */
export const templateLabel = (name: string): string => {
  const words = name.replace(/^t_/, "").replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
};

/**
 * The owner's text with "[name]" → Meta's {{1}}. Only [name] is a placeholder (the customer's
 * first name, filled in when sent); other brackets stay as typed.
 */
export function toMetaBody(text: string): { body: string; variables: number } {
  let body = text.trim();
  const has = /\[name\]/i.test(body);
  body = body.replace(/\[name\]/gi, "{{1}}");
  return { body, variables: has ? 1 : 0 };
}

/** What a template's status means for the owner, in plain words. */
export function statusText(status: string): { text: string; tone: "ok" | "wait" | "bad" } {
  switch (status) {
    case "APPROVED":
      return { text: "Approved", tone: "ok" };
    case "PENDING":
    case "IN_APPEAL":
      return { text: "In review", tone: "wait" };
    case "REJECTED":
      return { text: "Rejected", tone: "bad" };
    case "PAUSED":
      return { text: "Paused by Meta", tone: "bad" };
    case "DISABLED":
      return { text: "Turned off by Meta", tone: "bad" };
    case "PENDING_DELETION":
      return { text: "Being deleted", tone: "bad" };
    default:
      return { text: status, tone: "wait" };
  }
}
