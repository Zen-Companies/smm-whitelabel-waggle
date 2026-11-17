"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { parseStock, STORE_PLATFORMS } from "./shop";

export type StockState = { error?: string; done?: string };

/** Set a product variant's units at one location (T84b). */
export async function setStockAction(_prev: StockState, f: FormData): Promise<StockState> {
  const tenant = await getTenantFor("posts.write");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const quantity = parseStock(f.get("quantity"));
  if (quantity === null) return { error: "Use a whole number, 0 or more." };
  const accountId = String(f.get("accountId") ?? "");
  const productId = String(f.get("productId") ?? "").slice(0, 100);
  const variantId = String(f.get("variantId") ?? "").slice(0, 100);
  const locationId = String(f.get("locationId") ?? "").slice(0, 100);
  if (!productId || !variantId || !locationId)
    return { error: "Something went wrong. Reload the page." };
  const social = getSocialProvider();
  try {
    // The store must be this brand's own connected site; ids aren't brand-scoped upstream.
    const sites = await social.listIntegrations({
      profileId: tenant.zernioProfileId,
      platforms: STORE_PLATFORMS,
      signal: AbortSignal.timeout(15_000),
    });
    if (!sites.some((s) => s.id === accountId && s.active)) {
      return { error: "That store isn't connected any more. Reload the page." };
    }
    await social.setStock({
      accountId,
      productId,
      variantId,
      locationId,
      quantity,
      signal: AbortSignal.timeout(20_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "shop_stock_set",
      actor: tenant.userId,
      details: { accountId, productId, variantId, locationId, quantity },
    });
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 403) return { error: "The store doesn't allow stock changes from here yet." };
    if (s === 400 || s === 404) {
      return { error: "That product changed in your store. Reload the page." };
    }
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "setStock" } });
    return { error: "It couldn't be saved right now. Try again in a moment." };
  }
  revalidatePath("/posts/shop");
  return { done: "Saved." };
}
