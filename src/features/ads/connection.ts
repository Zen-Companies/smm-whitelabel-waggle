import { getSocialProvider } from "@/lib/social";
import type { AdAccount, AdConnection } from "@/lib/social/types";
import { networkOfConnection, type AdNetwork } from "./networks";

/**
 * The brand's ads connections by network (`metaads`, `linkedinads`, `pinterestads`), read from
 * its own Zernio profile, so anything listed through them belongs to the brand.
 */
export async function adConnections(
  profileId: string,
): Promise<Partial<Record<AdNetwork, AdConnection>>> {
  const all = await getSocialProvider().listAdConnections({
    profileId,
    signal: AbortSignal.timeout(15_000),
  });
  const out: Partial<Record<AdNetwork, AdConnection>> = {};
  for (const c of all) {
    const n = networkOfConnection(c.platform);
    if (n && c.active && !out[n]) out[n] = c;
  }
  return out;
}

/** The brand's Meta ads connection; null until Meta ads is connected. */
export async function metaAdsConnection(profileId: string): Promise<AdConnection | null> {
  return (await adConnections(profileId)).meta ?? null;
}

/** An ad account with the network and connection it came from. */
export type NetworkAdAccount = AdAccount & { network: AdNetwork; connectionId: string };

/** Every ad account across the brand's connections. */
export async function networkAdAccounts(
  conns: Partial<Record<AdNetwork, AdConnection>>,
  signal: AbortSignal,
): Promise<NetworkAdAccount[]> {
  const lists = await Promise.all(
    (Object.entries(conns) as [AdNetwork, AdConnection][]).map(async ([network, c]) =>
      (await getSocialProvider().listAdAccounts({ connectionId: c.id, signal })).map(
        (a): NetworkAdAccount => ({ ...a, network, connectionId: c.id }),
      ),
    ),
  );
  return lists.flat();
}
