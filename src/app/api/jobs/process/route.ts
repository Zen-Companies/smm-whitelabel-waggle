import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { processDueItems, PRODUCTION_STEPS } from "@/features/inbox";
import { embedPendingEntries } from "@/features/knowledge-base";
import { createDeadline } from "@/lib/jobs";
import { getLlmClientOrNull } from "@/lib/llm";
import { getServiceClient } from "@/lib/supabase/service";

// Called every minute by pg_cron + pg_net with `Authorization: Bearer CRON_SECRET` (§7.2).
// 60 s max so runs don't overlap; the deadline stops claiming at 45 s.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const db = getServiceClient();
    const deadline = createDeadline();
    const items = await processDueItems({ db, steps: PRODUCTION_STEPS, deadline });

    // Knowledge base entries without an embedding (new, edited, or a failed embed: T8).
    const llm = getLlmClientOrNull();
    const kb =
      llm && deadline.canStartItem()
        ? await embedPendingEntries({ db, llm }, { shouldContinue: deadline.canStartItem })
        : { embedded: 0, failed: 0 };

    return Response.json({ ...items, kbEmbedded: kb.embedded, kbEmbedFailed: kb.failed });
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
