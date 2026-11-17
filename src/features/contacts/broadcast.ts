// Broadcasts (T78b, design "Contacts · Broadcasts"): one approved WhatsApp template to everyone
// with a tag who agreed to messages (`/v1/broadcasts`, segment = tag + subscribed). Instagram and
// Facebook broadcasts only reach people inside the 24 h window, so they're left out; texts come
// with Phone (T82).

export type BroadcastInput = {
  name: string;
  accountId: string;
  template: { name: string; language: string; variables: number };
  /** null = everyone who agreed to messages. */
  tag: string | null;
  /** ISO, or null to send now. */
  scheduledAt: string | null;
};

const AHEAD_MS = 10 * 60_000;

export function parseBroadcastForm(
  f: FormData,
  now: Date,
): { ok: true; value: BroadcastInput } | { ok: false; field: string; error: string } {
  const name = String(f.get("name") ?? "").trim();
  if (!name) return { ok: false, field: "name", error: "Give it a name you'll recognise." };
  const accountId = String(f.get("accountId") ?? "");
  if (!accountId) return { ok: false, field: "accountId", error: "Connect WhatsApp first." };
  const [tName, tLang, tVars] = String(f.get("template") ?? "").split("|");
  const variables = Number(tVars);
  if (!tName || !tLang || !Number.isInteger(variables)) {
    return { ok: false, field: "template", error: "Pick an approved template." };
  }
  if (variables > 1) {
    return { ok: false, field: "template", error: "Pick a template with at most one blank (the person's name)." };
  }
  const tag = String(f.get("tag") ?? "").trim().toLowerCase() || null;
  let scheduledAt: string | null = null;
  if (f.get("when") === "later") {
    const at = new Date(String(f.get("scheduledAt") ?? ""));
    if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() + AHEAD_MS) {
      return { ok: false, field: "when", error: "Pick a time at least 10 minutes from now." };
    }
    scheduledAt = at.toISOString();
  }
  return {
    ok: true,
    value: { name: name.slice(0, 100), accountId, template: { name: tName, language: tLang, variables }, tag, scheduledAt },
  };
}
