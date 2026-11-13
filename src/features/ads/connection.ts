import { getSocialProvider } from "@/lib/social";
import type { AdConnection } from "@/lib/social/types";

/**
 * The brand's Meta ads connection (`metaads`), read from its own Zernio profile, so anything
 * listed through it belongs to the brand. Null until Meta ads is connected.
 */
export async function metaAdsConnection(profileId: string): Promise<AdConnection | null> {
  const all = await getSocialProvider().listAdConnections({
    profileId,
    signal: AbortSignal.timeout(15_000),
  });
  return all.find((c) => c.platform === "metaads" && c.active) ?? null;
}
