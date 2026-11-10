import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncAccountPictures } from "@/features/accounts/pictures";
import { PICTURES_BUCKET } from "@/lib/pictures";
import { MockSocialProvider } from "@/lib/social/mock";
import type { AccountPicture } from "@/lib/social/types";
import { serviceClient } from "./helpers";

// T57: the account check copies a connected account's picture into our storage, leaves it when
// the link is the same, replaces it when the link changes and drops it when the platform has none.
class PictureSocial extends MockSocialProvider {
  pictures: AccountPicture[] = [];
  override async listAccountPictures() {
    return this.pictures;
  }
}

const db = serviceClient();
const social = new PictureSocial();
const zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;
let tenantId: string;
let accountId: string;
let downloads = 0;
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const fakeFetch: typeof fetch = async () => {
  downloads += 1;
  return new Response(png, { headers: { "content-type": "image/png" } });
};
const deps = { db, social: () => social, fetch: fakeFetch };

async function account() {
  const { data } = await db
    .from("social_accounts")
    .select("picture_url, picture_path")
    .eq("id", accountId)
    .single();
  return data!;
}

beforeAll(async () => {
  const { data: tenant } = await db
    .from("tenants")
    .insert({ name: "Picture Café" })
    .select("id")
    .single();
  tenantId = tenant!.id;
  const { data: acc } = await db
    .from("social_accounts")
    .insert({ tenant_id: tenantId, zernio_account_id: zernioAccountId, platform: "instagram" })
    .select("id")
    .single();
  accountId = acc!.id;
});

afterAll(async () => {
  const { data: files } = await db.storage.from(PICTURES_BUCKET).list(`accounts/${accountId}`);
  if (files?.length) {
    await db.storage
      .from(PICTURES_BUCKET)
      .remove(files.map((f) => `accounts/${accountId}/${f.name}`));
  }
  await db.from("tenants").delete().eq("id", tenantId);
});

describe("account pictures (T57)", () => {
  it("copies a new picture into storage", async () => {
    social.pictures = [{ accountId: zernioAccountId, pictureUrl: "https://cdn.example.com/a.jpg" }];
    expect(await syncAccountPictures(deps, { id: tenantId, zernioProfileId: "prof" })).toEqual({
      updated: 1,
    });
    const a = await account();
    expect(a.picture_url).toBe("https://cdn.example.com/a.jpg");
    expect(a.picture_path).toMatch(new RegExp(`^accounts/${accountId}/[0-9a-f-]+\\.png$`));
    const { data } = await db.storage.from(PICTURES_BUCKET).download(a.picture_path!);
    expect(data?.size).toBe(png.byteLength);
  });

  it("does nothing while the link is the same", async () => {
    const before = downloads;
    expect(await syncAccountPictures(deps, { id: tenantId, zernioProfileId: "prof" })).toEqual({
      updated: 0,
    });
    expect(downloads).toBe(before);
  });

  it("replaces the copy when the link changes, and drops it when there's none", async () => {
    const first = (await account()).picture_path;
    social.pictures = [{ accountId: zernioAccountId, pictureUrl: "https://cdn.example.com/b.jpg" }];
    await syncAccountPictures(deps, { id: tenantId, zernioProfileId: "prof" });
    const second = (await account()).picture_path;
    expect(second).not.toBe(first);
    const { data: old } = await db.storage.from(PICTURES_BUCKET).download(first!);
    expect(old).toBeNull();

    social.pictures = [{ accountId: zernioAccountId, pictureUrl: null }];
    await syncAccountPictures(deps, { id: tenantId, zernioProfileId: "prof" });
    expect(await account()).toEqual({ picture_url: null, picture_path: null });
  });
});
