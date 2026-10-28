/**
 * Triage report (docs/tasks.md T7): runs the labeled set in tests/fixtures/triage through every
 * configured classifier and prints accuracy per category, a confusion matrix and p50/p95 latency.
 *
 *   pnpm triage:report [--concurrency 4] [--only jev,llm] [--limit 20] [--json out.json]
 *
 * Classifiers (each runs only if configured in .env.local / the environment):
 *   jev             JEV_API_URL (+ JEV_API_KEY): the direct adapter (§9.1)
 *   jev:<name>      TRIAGE_JEV_ENDPOINTS="local=http://127.0.0.1:8017/v1/systemone,cloud=https://..."
 *                   key per endpoint from JEV_API_KEY_<NAME> (falls back to JEV_API_KEY)
 *   jev-openrouter  OPENROUTER_API_KEY: Jev via OpenRouter's Decisions API (typesafe/jev-1.13)
 *   llm             OPENROUTER_API_KEY + LLM_CLASSIFY_MODEL: the LLM fallback classifier
 *
 * Each classifier is called directly (no fallback), with a 30 s timeout, so latency is the
 * backend's own. Nothing is written to the database; AI cost is summed from usage data.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { formatReport, summarizeRun, type RunResult } from "../src/features/triage/report";
import { loadLabeledSet } from "../src/features/triage/labeled-set";
import { JevClassifier } from "../src/lib/classifier/jev";
import { OpenRouterJevClassifier } from "../src/lib/classifier/jev-openrouter";
import { LlmClassifier } from "../src/lib/classifier/llm";
import type { Classifier } from "../src/lib/classifier/types";
import { createLlmClient } from "../src/lib/llm/client";
import { loadLlmConfig } from "../src/lib/llm/config";
import { resolveModels } from "../src/lib/llm/provider";
import type { AiUsageRecord, UsageRecorder } from "../src/lib/llm/usage";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const { values: args } = parseArgs({
  options: {
    concurrency: { type: "string", default: "4" },
    only: { type: "string" },
    limit: { type: "string" },
    json: { type: "string" },
    fixtures: { type: "string", default: "tests/fixtures/triage" },
  },
});

interface Candidate {
  name: string;
  classifier: Classifier;
  usage: AiUsageRecord[];
}

function memoryUsage(): UsageRecorder & { records: AiUsageRecord[] } {
  const records: AiUsageRecord[] = [];
  return { records, record: async (r) => void records.push(r) };
}

function candidates(): { ready: Candidate[]; skipped: string[] } {
  const ready: Candidate[] = [];
  const skipped: string[] = [];
  const env = process.env;
  const cost = Number(env.JEV_COST_PER_MTOK_INPUT || 0);
  const model = env.JEV_MODEL || "jev-latest";

  const jevEndpoints: [string, string, string | undefined][] = [];
  if (env.JEV_API_URL) jevEndpoints.push(["jev", env.JEV_API_URL, env.JEV_API_KEY]);
  for (const pair of (env.TRIAGE_JEV_ENDPOINTS ?? "").split(",").filter(Boolean)) {
    const [name, url] = pair.split("=");
    const key = env[`JEV_API_KEY_${name.toUpperCase()}`] ?? env.JEV_API_KEY;
    jevEndpoints.push([`jev:${name}`, url, key]);
  }
  if (jevEndpoints.length === 0) skipped.push("jev (set JEV_API_URL or TRIAGE_JEV_ENDPOINTS)");
  for (const [name, url, apiKey] of jevEndpoints) {
    const usage = memoryUsage();
    ready.push({
      name,
      usage: usage.records,
      classifier: new JevClassifier({ url, apiKey, model, costPerMTokInput: cost }, { usage }),
    });
  }

  if (env.OPENROUTER_API_KEY) {
    const usage = memoryUsage();
    ready.push({
      name: "jev-openrouter",
      usage: usage.records,
      classifier: new OpenRouterJevClassifier({ apiKey: env.OPENROUTER_API_KEY }, { usage }),
    });
  } else {
    skipped.push("jev-openrouter (set OPENROUTER_API_KEY)");
  }

  try {
    const config = loadLlmConfig();
    const usage = memoryUsage();
    const llm = createLlmClient({ models: resolveModels(config), usage });
    ready.push({
      name: `llm (${config.LLM_CLASSIFY_MODEL})`,
      usage: usage.records,
      classifier: new LlmClassifier(llm),
    });
  } catch {
    skipped.push(
      "llm (set OPENROUTER_API_KEY, LLM_CLASSIFY_MODEL, LLM_DRAFT_MODEL, EMBEDDING_MODEL)",
    );
  }

  const only = args.only?.split(",");
  return {
    ready: only ? ready.filter((c) => only.some((o) => c.name.startsWith(o))) : ready,
    skipped,
  };
}

async function runOne(
  candidate: Candidate,
  messages: ReturnType<typeof loadLabeledSet>["messages"],
  businessContext: string,
) {
  const results: RunResult[] = new Array(messages.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < messages.length; i = next++) {
      const m = messages[i];
      const started = performance.now();
      try {
        const c = await candidate.classifier.classify(
          { tenantId: "triage-report", text: m.text, kind: m.kind, businessContext },
          { signal: AbortSignal.timeout(30_000) },
        );
        results[i] = {
          id: m.id,
          expected: m.expected,
          predicted: c.category,
          confidence: c.confidence,
          latencyMs: performance.now() - started,
          ambiguous: m.ambiguous,
          lang: m.lang,
        };
      } catch (error) {
        results[i] = {
          id: m.id,
          expected: m.expected,
          predicted: null,
          latencyMs: performance.now() - started,
          error: (error as Error).message,
          ambiguous: m.ambiguous,
          lang: m.lang,
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(args.concurrency)) }, worker));
  return results;
}

async function main() {
  const set = loadLabeledSet(args.fixtures!);
  const messages = args.limit ? set.messages.slice(0, Number(args.limit)) : set.messages;
  const { ready, skipped } = candidates();

  console.log(`Triage report: ${messages.length} labeled messages for ${set.business.name}`);
  for (const s of skipped) console.log(`skipped: ${s}`);
  if (ready.length === 0) {
    console.log("No classifier configured; nothing to run.");
    return;
  }

  const out: Record<string, unknown> = {};
  for (const candidate of ready) {
    console.log(`\nrunning ${candidate.name}…`);
    const results = await runOne(candidate, messages, set.business.context);
    const summary = summarizeRun(results);
    const costUsd = candidate.usage.reduce((sum, u) => sum + u.costUsd, 0);
    console.log(formatReport(candidate.name, summary, { costUsd }));
    const misses = results.filter((r) => r.predicted !== r.expected);
    if (misses.length) {
      console.log(`\nmisclassified (${misses.length}):`);
      for (const r of misses.slice(0, 40)) {
        const text = messages.find((m) => m.id === r.id)?.text ?? "";
        console.log(
          `  ${r.id.padEnd(14)} expected ${r.expected.padEnd(9)} got ${(r.predicted ?? `error: ${r.error}`).padEnd(9)} ${text.slice(0, 70)}`,
        );
      }
    }
    out[candidate.name] = { summary, costUsd, results };
  }
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(out, null, 2));
    console.log(`\nwrote ${args.json}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
