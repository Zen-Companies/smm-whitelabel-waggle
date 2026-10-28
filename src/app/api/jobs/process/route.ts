import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { processDueItems, PRODUCTION_STEPS } from "@/features/inbox";
import { createDeadline } from "@/lib/jobs";
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
    const summary = await processDueItems({
      db: getServiceClient(),
      steps: PRODUCTION_STEPS,
      deadline: createDeadline(),
    });
    return Response.json(summary);
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
