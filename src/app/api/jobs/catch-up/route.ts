import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import { z } from "zod";
import { kickCatchUp, MAX_KICK_HOPS, runCatchUpSlice } from "@/features/catch-up";
import { getProductionSteps } from "@/features/inbox";
import { createDeadline } from "@/lib/jobs";
import { getLlmClientOrNull } from "@/lib/llm";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";

// First connect (20 Nov): runs one brand's catch-up right after its account was connected
// (kicked by the connect handler, then by itself while the catch-up isn't ready), so the reading
// screen's counters move within seconds instead of waiting for the once-a-minute job.
// `Authorization: Bearer CRON_SECRET`, like /api/jobs/process. Answers 202 at once; the work runs
// after the response, within this route's max duration.
export const maxDuration = 60;

const bodySchema = z.object({
  tenantId: z.uuid(),
  hop: z.number().int().min(0).max(MAX_KICK_HOPS).default(0),
});

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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const { tenantId, hop } = parsed.data;
  const deadline = createDeadline({ maxMs: 55_000 });

  after(async () => {
    try {
      const { phase } = await runCatchUpSlice(
        {
          db: getServiceClient(),
          social: getSocialProvider,
          llm: getLlmClientOrNull(),
          steps: getProductionSteps(),
          deadline,
        },
        tenantId,
      );
      if (phase && phase !== "ready") kickCatchUp(tenantId, hop + 1);
    } catch (error) {
      // Our own error text only, never customer text (CLAUDE.md rule 10).
      Sentry.captureException(error, { extra: { tenantId, hop } });
    }
  });
  return Response.json({ accepted: true }, { status: 202 });
}
