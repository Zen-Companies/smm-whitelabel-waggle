import * as Sentry from "@sentry/nextjs";
import { processDueItems } from "@/features/inbox";
import { claimItem, createDeadline } from "@/lib/jobs";
import { getSocialProvider } from "@/lib/social";
import type { ServiceClient } from "@/lib/supabase/service";
import { UNDO_WINDOW_MS } from "./decisions";
import { createSendStep } from "./send-step";

/**
 * Runs after an approval's response (Server Action `after()`): waits out the undo window, then
 * sends that one reply through the normal send step, instead of waiting for the next cron tick.
 * If it was undone, or a run already took it, there is nothing to claim and nothing happens.
 */
export async function sendApprovedReplyAfterUndoWindow(db: ServiceClient, itemId: string) {
  await new Promise((resolve) => setTimeout(resolve, UNDO_WINDOW_MS + 500));
  try {
    let claimed = false;
    await processDueItems({
      db,
      steps: { sending: createSendStep({ social: getSocialProvider }) },
      deadline: createDeadline(),
      claim: async () => {
        if (claimed) return [];
        claimed = true;
        const item = await claimItem(db, itemId, "sending");
        return item ? [item] : [];
      },
    });
  } catch (error) {
    // The cron tick sends it instead.
    Sentry.captureException(error, { extra: { itemId } });
  }
}
