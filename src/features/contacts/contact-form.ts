// Contacts (T78a, design "Contacts · list, consent, import"): people the business can message.
// Zernio keeps the contacts (`/v1/contacts`); consent to receive messages is what the owner
// says it is, so Waggle never ticks it on its own (docs: consent capture is up to us).

export type ContactInput = {
  name: string;
  /** +digits, for WhatsApp or texts. */
  phone?: string;
  email?: string;
  tags: string[];
  /** The person agreed to get messages from the business. */
  subscribed: boolean;
};

export type ImportRow = { name: string; phone?: string; email?: string; tags: string[] };

/** "+63 917 555 0142" → "+639175550142"; a local number takes the country code. */
export function normalizePhone(raw: string, countryCode = ""): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (countryCode) digits = countryCode + digits.replace(/^0+/, "");
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function tagsFrom(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseContactForm(
  f: FormData,
): { ok: true; value: ContactInput } | { ok: false; field: string; error: string } {
  const name = String(f.get("name") ?? "").trim();
  if (!name) return { ok: false, field: "name", error: "Add their name." };
  const phoneRaw = String(f.get("phone") ?? "");
  const phone = phoneRaw.trim() ? normalizePhone(phoneRaw, String(f.get("countryCode") ?? "")) : null;
  if (phoneRaw.trim() && !phone) {
    return { ok: false, field: "phone", error: "Type the number with its country code, e.g. +63 917 555 0142." };
  }
  const email = String(f.get("email") ?? "").trim();
  if (email && !EMAIL.test(email)) return { ok: false, field: "email", error: "That email doesn't look right." };
  return {
    ok: true,
    value: {
      name: name.slice(0, 120),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      tags: tagsFrom(String(f.get("tags") ?? "")),
      subscribed: f.get("consent") === "yes",
    },
  };
}

/** One CSV line, with quotes ("Lim, Paolo"). */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export const IMPORT_MAX = 1000;

/**
 * A pasted or uploaded CSV with a header row naming name, phone, email and tags (any order,
 * any case). Rows without a name or a phone are skipped; tags are split on ";".
 */
export function parseImport(
  csv: string,
  countryCode: string,
): { rows: ImportRow[]; skipped: number; tooMany: boolean } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: 0, tooMany: false };
  const head = csvCells(lines[0]).map((h) => h.toLowerCase());
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = col(["name", "full name", "fullname"]);
  const iPhone = col(["phone", "phone number", "mobile", "whatsapp", "number"]);
  const iEmail = col(["email", "e-mail"]);
  const iTags = col(["tags", "tag"]);
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = csvCells(line);
    const name = iName >= 0 ? cells[iName] : "";
    const phone = iPhone >= 0 ? normalizePhone(cells[iPhone] ?? "", countryCode) : null;
    if (!name || !phone) {
      skipped++;
      continue;
    }
    const email = iEmail >= 0 && EMAIL.test(cells[iEmail] ?? "") ? cells[iEmail] : undefined;
    rows.push({ name: name.slice(0, 120), phone, email, tags: iTags >= 0 ? tagsFrom(cells[iTags] ?? "") : [] });
  }
  return { rows: rows.slice(0, IMPORT_MAX), skipped, tooMany: rows.length > IMPORT_MAX };
}
