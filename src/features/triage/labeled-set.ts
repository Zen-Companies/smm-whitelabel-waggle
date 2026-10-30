import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CATEGORIES } from "@/lib/classifier/types";
import type { LabeledMessage } from "./report";

// Loads tests/fixtures/triage/*.json: one file per category (expected = file name) plus
// ambiguous.json (expected per message), and business.json (the shop the messages are for, with the
// profile its owner would write: T25). Niche sets in tests/fixtures/triage-sets/<name>/ keep every
// message in one file with `expected` per message.

const message = z.object({
  id: z.string().min(1),
  text: z.string(),
  kind: z.enum(["comment", "dm"]),
  lang: z.enum(["en", "taglish"]),
  expected: z.enum(CATEGORIES).optional(),
  ambiguous: z.boolean().optional(),
  note: z.string().optional(),
});
const business = z.object({ name: z.string().min(1), profile: z.string() });

export interface LabeledSet {
  business: z.infer<typeof business>;
  messages: LabeledMessage[];
}

export function loadLabeledSet(dir: string): LabeledSet {
  const messages: LabeledMessage[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "business.json")
    .sort()) {
    const fileCategory = file.replace(/\.json$/, "");
    const rows = z.array(message).parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
    for (const row of rows) {
      const fromFile = CATEGORIES.find((c) => c === fileCategory);
      const expected = row.expected ?? fromFile;
      if (!expected) throw new Error(`${file}: ${row.id} has no expected category`);
      messages.push({ ...row, expected });
    }
  }
  const ids = new Set<string>();
  for (const m of messages) {
    if (ids.has(m.id)) throw new Error(`duplicate fixture id ${m.id}`);
    ids.add(m.id);
  }
  return {
    business: business.parse(JSON.parse(readFileSync(join(dir, "business.json"), "utf8"))),
    messages,
  };
}
