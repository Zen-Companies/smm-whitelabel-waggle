import * as Sentry from "@sentry/nextjs";
import { processDueItems } from "@/features/inbox";
import { claimItem, createDeadline } from "@/lib/jobs";
import { getSocialProvider } from "@/lib/social";
import type { ServiceClient } from "@/lib/supabase/service";
import { UNDO_WINDOW_MS } from "./decisions";
import { createSendStep } from "./send-step";

/**
 * The longest an approval's `after()` waits for the reply's slot. Spaced-out sending (20 Nov)
 * books later replies 25 s apart; past this, the once-a-minute job sends them instead.
 */
export const SEND_NOW_MAX_WAIT_MS = 120_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs after an approval's response (Server Action `after()`): waits out the undo window and the
 * reply's slot (send-schedule.ts), then sends that one reply through the normal send step,
 * instead of waiting for the next cron tick. If it was undone, or a run already took it, there
 * is nothing to claim and nothing happens.
 */
export async function sendApprovedReplyAfterUndoWindow(db: ServiceClient, itemId: string) {
  const started = Date.now();
  await sleep(UNDO_WINDOW_MS + 500);
  try {
    const { data: row } = await db
      .from("inbound_items")
      .select("next_run_at")
      .eq("id", itemId)
      .maybeSingle();
    const slot = row?.next_run_at ? Date.parse(row.next_run_at) : null;
    if (slot !== null && slot > Date.now()) {
      if (slot - started > SEND_NOW_MAX_WAIT_MS) return;
      await sleep(slot - Date.now() + 500);
    }
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
