import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import { z } from "zod";
import { kickWeeklyCheck, MAX_WEEKLY_HOPS, runWeeklyChecks } from "@/features/weekly";
import { getClassifier } from "@/lib/classifier";
import { createDeadline } from "@/lib/jobs";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";

// Check now (board "Your week", 26 Nov): reads one business's check-up right after the owner
// asked, so the button's "Checking… 3 of 6 accounts" moves within seconds. Kicked by the action,
// then by itself while the run isn't done. `Authorization: Bearer CRON_SECRET`, like
// /api/jobs/process. Answers 202 at once; the work runs after the response.
export const maxDuration = 60;

const bodySchema = z.object({
  tenantId: z.uuid(),
  hop: z.number().int().min(0).max(MAX_WEEKLY_HOPS).default(0),
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
      const result = await runWeeklyChecks(
        {
          db: getServiceClient(),
          social: getSocialProvider,
          classifier: getClassifier(),
          shouldContinue: () => deadline.remainingMs() > 15_000,
        },
        { tenantId, limit: 1 },
      );
      if (result.runs > 0 && result.finished === 0) kickWeeklyCheck(tenantId, hop + 1);
    } catch (error) {
      // Ids only (CLAUDE.md rule 10).
      Sentry.captureException(error, { extra: { tenantId, hop } });
    }
  });
  return Response.json({ accepted: true }, { status: 202 });
}
