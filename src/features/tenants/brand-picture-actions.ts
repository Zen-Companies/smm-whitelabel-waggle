"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { checkPicture, PICTURE_ERRORS, removePicture, storePicture } from "@/lib/pictures";
import { getServiceClient } from "@/lib/supabase/service";
import { getTenantFor, NOT_ALLOWED } from "./current-tenant";

/** Business → Brand picture → "Upload my own" (or remove the upload). Owners and admins. */
export async function saveBrandPicture(
  formData: FormData,
): Promise<{ error?: string; saved?: number }> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const { data: before } = await db
    .from("tenants")
    .select("picture_path")
    .eq("id", tenant.id)
    .single();

  let path: string | null = null;
  if (formData.get("remove") !== "1") {
    const file = formData.get("picture");
    if (!(file instanceof File)) return { error: PICTURE_ERRORS.empty };
    const problem = checkPicture(file);
    if (problem) return { error: PICTURE_ERRORS[problem] };
    try {
      path = await storePicture(db, `brands/${tenant.id}`, {
        type: file.type,
        bytes: await file.arrayBuffer(),
      });
    } catch (e) {
      Sentry.captureException(e);
      return { error: PICTURE_ERRORS.failed };
    }
  }
  const { error } = await db
    .from("tenants")
    .update({ picture_path: path, picture_source: path ? "upload" : "none" })
    .eq("id", tenant.id);
  if (error) return { error: PICTURE_ERRORS.failed };
  await removePicture(db, before?.picture_path);
  await writeAudit(db, {
    tenantId: tenant.id,
    action: path ? "brand_picture_uploaded" : "brand_picture_removed",
    actor: tenant.userId,
  });
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}

export type PictureSourceState = { error?: string; saved?: number };

const sourceSchema = z.object({
  source: z.enum(["account", "upload", "none"]),
  accountId: z.uuid().optional(),
});

/** Business → Brand picture: a connected account's picture, the upload, or initials. */
export async function setBrandPictureSource(
  _prev: PictureSourceState,
  formData: FormData,
): Promise<PictureSourceState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = sourceSchema.safeParse({
    source: formData.get("source"),
    accountId: formData.get("accountId") || undefined,
  });
  if (!parsed.success) return { error: "Pick where the picture comes from." };
  const db = getServiceClient();
  if (parsed.data.source === "upload") {
    const { data } = await db.from("tenants").select("picture_path").eq("id", tenant.id).single();
    if (!data?.picture_path) return { error: "Upload a picture first." };
  }
  if (parsed.data.accountId) {
    const { data } = await db
      .from("social_accounts")
      .select("id")
      .eq("id", parsed.data.accountId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!data) return { error: "That account isn't connected to this brand." };
  }
  const { error } = await db
    .from("tenants")
    .update({
      picture_source: parsed.data.source,
      ...(parsed.data.source === "account"
        ? { picture_account_id: parsed.data.accountId ?? null }
        : {}),
    })
    .eq("id", tenant.id);
  if (error) return { error: "Couldn't save. Try again." };
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "brand_picture_source_changed",
    actor: tenant.userId,
    details: { source: parsed.data.source },
  });
  revalidatePath("/", "layout");
  return { saved: Date.now() };
}
