/**
 * Draft check (docs/tasks.md T28): runs the free draft checks over drafts already in the local
 * database, so no AI calls are made. Grounding is recomputed against the facts each draft was
 * written from (drafts.kb_entry_ids).
 *
 *   pnpm draft:check [--tenant <uuid>] [--days 30] [--limit 200]
 *
 * Read only. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase).
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { checkDraft, groundingIssues } from "@/features/drafting";
import type { Database } from "@/lib/supabase/database.types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const DEMO_TENANT = "10000000-0000-4000-8000-000000000001";
const { values: args } = parseArgs({
  options: {
    tenant: { type: "string", default: DEMO_TENANT },
    days: { type: "string", default: "30" },
    limit: { type: "string", default: "200" },
  },
});

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    return;
  }
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });
  const since = new Date(Date.now() - Number(args.days) * 24 * 3_600_000).toISOString();

  const { data, error } = await db
    .from("drafts")
    .select("id, body, needs_human, kb_entry_ids, inbound_items!inner (kind, text)")
    .eq("tenant_id", args.tenant!)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(Number(args.limit));
  if (error) throw new Error(error.message);
  const drafts = (data ?? []) as unknown as {
    id: string;
    body: string;
    needs_human: boolean;
    kb_entry_ids: string[];
    inbound_items: { kind: "comment" | "dm"; text: string };
  }[];

  const kbIds = [...new Set(drafts.flatMap((d) => d.kb_entry_ids))];
  const { data: kb } = kbIds.length
    ? await db.from("kb_entries").select("id, title, content").in("id", kbIds)
    : { data: [] };
  const facts = new Map((kb ?? []).map((e) => [e.id, e]));

  let checked = 0;
  const byCheck = new Map<string, number>();
  for (const d of drafts) {
    const results = checkDraft({
      reply: d.body,
      needsHuman: d.needs_human,
      groundingIssues: groundingIssues(
        d.body,
        d.kb_entry_ids.flatMap((id) => facts.get(id) ?? []),
      ),
      kind: d.inbound_items.kind,
      customerText: d.inbound_items.text,
    });
    checked += results.length;
    for (const r of results.filter((r) => !r.ok)) {
      byCheck.set(r.check, (byCheck.get(r.check) ?? 0) + 1);
      // Ids and the check only: draft and message text stay out of the output (rule 10 spirit).
      console.log(`✗ draft ${d.id}: ${r.check}: ${r.detail}`);
    }
  }
  const failed = [...byCheck.values()].reduce((a, b) => a + b, 0);
  console.log(
    `\n${drafts.length} drafts, ${checked} checks, ${checked - failed} passed` +
      (failed ? ` (${[...byCheck].map(([c, n]) => `${c} ${n}`).join(", ")})` : ""),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
