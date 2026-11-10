import * as Sentry from "@sentry/nextjs";
import { PICTURE_MAX_BYTES, PICTURE_TYPES, removePicture, storePicture } from "@/lib/pictures";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";

// T57: a brand can use a connected account's picture. Zernio gives the platform's link
// (`SocialAccount.profilePicture`), which expires, so the hourly account check keeps a copy in
// our storage and replaces it when the link changes.

export interface PictureDeps {
  db: ServiceClient;
  social: () => SocialProvider;
  fetch?: typeof fetch;
}

/** Downloads a platform picture: images only, 2 MB at most, 10 seconds at most. */
async function download(
  url: string,
  doFetch: typeof fetch,
): Promise<{ type: string; bytes: ArrayBuffer } | null> {
  const res = await doFetch(url, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!(PICTURE_TYPES as readonly string[]).includes(type)) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > PICTURE_MAX_BYTES) return null;
  return { type, bytes };
}

/** Copies new or changed account pictures for one brand. One account failing skips only it. */
export async function syncAccountPictures(
  deps: PictureDeps,
  tenant: { id: string; zernioProfileId: string },
  now = new Date(),
): Promise<{ updated: number }> {
  const { db } = deps;
  const pictures = await deps.social().listAccountPictures({ profileId: tenant.zernioProfileId });
  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, zernio_account_id, picture_url, picture_path")
    .eq("tenant_id", tenant.id);
  let updated = 0;
  for (const account of accounts ?? []) {
    const pic = pictures.find((p) => p.accountId === account.zernio_account_id);
    if (!pic || pic.pictureUrl === account.picture_url) continue;
    try {
      let path: string | null = null;
      if (pic.pictureUrl) {
        const file = await download(pic.pictureUrl, deps.fetch ?? fetch);
        if (!file) continue;
        path = await storePicture(db, `accounts/${account.id}`, file);
      }
      await db
        .from("social_accounts")
        .update({
          picture_url: pic.pictureUrl,
          picture_path: path,
          picture_checked_at: now.toISOString(),
        })
        .eq("id", account.id);
      await removePicture(db, account.picture_path);
      updated += 1;
    } catch (err) {
      Sentry.captureException(err, { extra: { tenantId: tenant.id, accountId: account.id } });
    }
  }
  return { updated };
}
