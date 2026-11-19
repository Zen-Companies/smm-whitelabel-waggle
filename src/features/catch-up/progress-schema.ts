import { z } from "zod";
import type { CatchUpProgress } from "./reveal-data";

/** The reading screen's poll answer (GET /api/catch-up/progress), checked before it's shown. */
export const progressSchema = z.object({
  catchUpId: z.string(),
  phase: z.enum(["reading", "sorting", "drafting", "ready"]),
  platform: z.string(),
  handle: z.string().nullable(),
  commentsFound: z.number().int().nonnegative(),
  messagesFound: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  capped: z.boolean(),
  dmAccessMissing: z.boolean(),
}) satisfies z.ZodType<CatchUpProgress>;

/** Pure: a poll's body as progress, or null (no catch-up, an error page, or a bad shape). */
export function parseProgress(body: unknown): CatchUpProgress | null {
  const parsed = progressSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/** How often the reading screen asks (no Realtime, board "Under the hood"). */
export const POLL_MS = 2000;
