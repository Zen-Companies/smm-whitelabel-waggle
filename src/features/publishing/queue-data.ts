import "server-only";
import * as Sentry from "@sentry/nextjs";
import { getSocialProvider } from "@/lib/social";
import type { PostingQueue } from "@/lib/social/types";

/**
 * The brand's posting times (T75), or null when it has none or they can't be read right now
 * (the composer then offers Now and Pick a time only).
 */
export async function loadQueue(profileId: string | null): Promise<PostingQueue | null> {
  if (!profileId) return null;
  try {
    return await getSocialProvider().getQueue({ profileId, signal: AbortSignal.timeout(8_000) });
  } catch (error) {
    Sentry.captureException(error, { extra: { step: "getQueue" } });
    return null;
  }
}
