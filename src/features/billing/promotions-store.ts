import "server-only";
import { cache } from "react";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { rowToPromotion } from "./promotion-records";
import { PROMOTIONS, type Promotion } from "./promotions";

// The promotions the app runs (Staff → Promotions, 24 Nov): the `promotions` table, read with the
// service role on the server. The code's list (promotions.ts) is the fallback when the table is
// empty or can't be read, so a promotion surface never breaks a page.
// Cached briefly per server instance (and once per request); a save on Staff → Promotions clears
// this instance's copy, others pick it up within the TTL.

export const PROMOTIONS_TTL_MS = 30_000;

let memo: { at: number; list: readonly Promotion[] } | null = null;

/** Reads the table (no cache). Code defaults when it's empty or unreachable. */
export async function readPromotions(db: ServiceClient): Promise<readonly Promotion[]> {
  try {
    const { data, error } = await db.from("promotions").select("*").order("created_at");
    if (error || !data?.length) {
      if (error) console.error("billing: reading promotions failed", { error: error.message });
      return PROMOTIONS;
    }
    return data.map(rowToPromotion);
  } catch (e) {
    console.error("billing: reading promotions failed", {
      error: e instanceof Error ? e.message : "unknown",
    });
    return PROMOTIONS;
  }
}

/** The promotions now: cached for a short while. */
export async function loadPromotionsFresh(
  db: ServiceClient = getServiceClient(),
  now: number = Date.now(),
): Promise<readonly Promotion[]> {
  if (memo && now - memo.at < PROMOTIONS_TTL_MS) return memo.list;
  const list = await readPromotions(db);
  memo = { at: now, list };
  return list;
}

/** Once per request (React cache) over the short cache. */
export const loadPromotions = cache(() => loadPromotionsFresh());

/** A save on Staff → Promotions: the next read goes to the table. */
export function clearPromotionsCache(): void {
  memo = null;
}
