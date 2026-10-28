/**
 * Draft preview (docs/tasks.md T9): prints the draft the receptionist would write for each sample
 * message, using the real retrieval + prompt + grounding check against a tenant's knowledge base
 * in the local database (default: the seeded demo, Harbour Bean Café).
 *
 *   pnpm draft:preview [--tenant <uuid>] [--samples tests/fixtures/drafting/samples.json]
 *                      [--only hours-sunday,lead-cake] [--text "Do you have wifi?" --kind dm]
 *
 * Needs OPENROUTER_API_KEY, LLM_CLASSIFY_MODEL, LLM_DRAFT_MODEL and EMBEDDING_MODEL (in
 * .env.local) and local Supabase. It embeds the tenant's entries that have no embedding yet
 * (stored, like the job route would), then drafts in memory: no drafts, leads or ai_usage rows.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateDraft } from "@/features/drafting";
import { embedPendingEntries } from "@/features/knowledge-base";
import { createLlmClient } from "@/lib/llm/client";
import { loadLlmConfig } from "@/lib/llm/config";
import { resolveModels } from "@/lib/llm/provider";
import type { AiUsageRecord } from "@/lib/llm/usage";
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
    samples: { type: "string", default: "tests/fixtures/drafting/samples.json" },
    only: { type: "string" },
    text: { type: "string" },
    kind: { type: "string", default: "dm" },
    category: { type: "string", default: "faq" },
  },
});

const sampleSchema = z.array(
  z.object({
    id: z.string(),
    kind: z.enum(["comment", "dm"]),
    category: z.string(),
    text: z.string(),
    expect: z.string().optional(),
  }),
);

async function main() {
  let config;
  try {
    config = loadLlmConfig();
  } catch (error) {
    console.log(`Not configured: ${(error as Error).message}. Add the LLM keys to .env.local.`);
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (local Supabase).",
    );
    return;
  }

  const db = createClient<Database>(url, key, { auth: { persistSession: false } });
  const records: AiUsageRecord[] = [];
  const llm = createLlmClient({
    models: resolveModels(config),
    usage: { record: async (r) => void records.push(r) },
  });

  const { data: tenant } = await db.from("tenants").select("name").eq("id", args.tenant!).single();
  if (!tenant) throw new Error(`tenant ${args.tenant} not found`);
  const embedded = await embedPendingEntries({ db, llm }, { tenantId: args.tenant, limit: 100 });
  console.log(
    `Draft preview for ${tenant.name} (model ${config.LLM_DRAFT_MODEL}); embedded ${embedded.embedded} pending KB entries.\n`,
  );

  const samples = args.text
    ? [
        {
          id: "custom",
          kind: args.kind as "comment" | "dm",
          category: args.category!,
          text: args.text,
        },
      ]
    : sampleSchema.parse(JSON.parse(readFileSync(args.samples!, "utf8")));
  const only = args.only?.split(",");

  for (const s of only ? samples.filter((x) => only.includes(x.id)) : samples) {
    const started = performance.now();
    const draft = await generateDraft(
      { db, llm },
      {
        tenantId: args.tenant!,
        businessName: tenant.name,
        kind: s.kind,
        category: s.category,
        text: s.text,
      },
    );
    const ms = Math.round(performance.now() - started);
    console.log(`── ${s.id} (${s.kind}, ${s.category}) ${ms} ms`);
    console.log(`customer: ${s.text}`);
    if ("expect" in s && s.expect) console.log(`expected: ${s.expect}`);
    console.log(
      `facts:    ${draft.facts.map((f) => `${f.title} (${f.similarity.toFixed(2)})`).join(", ") || "none"}`,
    );
    console.log(`reply:    ${draft.result.reply}`);
    console.log(
      `needsHuman: ${draft.needsHuman}${draft.needsHumanReason ? ` (${draft.needsHumanReason})` : ""}`,
    );
    if (draft.result.lead) console.log(`lead:     ${JSON.stringify(draft.result.lead)}`);
    console.log("");
  }
  const cost = records.reduce((sum, r) => sum + r.costUsd, 0);
  console.log(`AI calls: ${records.length}, cost $${cost.toFixed(5)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
