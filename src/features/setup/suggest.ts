import "server-only";
import * as Sentry from "@sentry/nextjs";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { getLlmClientOrNull, loadTenantAiSpend } from "@/lib/llm";
import { getServiceClient } from "@/lib/supabase/service";
import { cleanQuestions } from "./suggest-clean";

const schema = z.object({ questions: z.array(z.string()).max(8) });

const SYSTEM = `You help a small business set up an assistant that answers its customers on social media.
Given the kind of business, list the 6 questions its customers ask most in comments and DMs.
Short, plain, in the customer's words, each ending with "?". No answers, no numbering, no prices.`;

/** One call per brand and kind of business, kept for weeks: step 3 can be opened many times. */
async function askModel(tenantId: string, kind: string): Promise<string[]> {
  "use cache";
  cacheLife("weeks");
  const llm = getLlmClientOrNull();
  if (!llm) throw new Error("llm not configured");
  const { object } = await llm.generateObject({
    tenantId,
    purpose: "draft",
    schema,
    system: SYSTEM,
    prompt: `Kind of business: ${kind}`,
  });
  // Thrown, not returned, when empty: a failure must not be kept in the cache.
  const questions = cleanQuestions(object.questions);
  if (questions.length < 3) throw new Error("too few questions");
  return questions;
}

/**
 * Step 3 for Something else (approved 17 Nov): questions customers of "Dog grooming" ask, as
 * suggestions only (nothing is saved until the owner writes an answer). Null when the AI isn't
 * set up, the monthly AI cap is reached or the call fails: step 3 falls back to the generic three.
 */
export async function suggestedQuestions(tenantId: string, kind: string): Promise<string[] | null> {
  const what = kind.trim();
  if (!what || !getLlmClientOrNull()) return null;
  try {
    const spend = await loadTenantAiSpend(getServiceClient(), tenantId, new Date());
    if (spend.level === "reached") return null;
    return await askModel(tenantId, what.toLowerCase());
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId } });
    return null;
  }
}
