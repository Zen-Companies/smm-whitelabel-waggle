"use server";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { can, isOrgRole } from "@/features/orgs";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider, resolveSocialProviderMode } from "@/lib/social";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  ADD_PHOTOS_MAX,
  ADD_PHOTOS_ISSUE_MAX,
  fileKind,
  isOurUploadUrl,
  uploadState,
} from "./add-photos";

// Waggle's "Add photos for your post" page (design "AI assistants · Add photos from a chat",
// approved 17 Nov). The browser PUTs each file straight to Zernio's storage (presigned, like the
// composer's videos); we only record the public links on the upload. Only the person the upload
// was made for, while it's open, and while they may still post for the brand. Only links our
// presign handed out for this upload are saved (security review, 17 Nov).

export type AddPhotoResult = { error: string } | { ok: true };

const idSchema = z.uuid();

async function openUploadFor(uploadId: string) {
  if (!idSchema.safeParse(uploadId).success) return null;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const db = getServiceClient();
  const { data } = await db
    .from("media_uploads")
    .select("id, tenant_id, created_by, files, expires_at, done_at")
    .eq("id", uploadId)
    .maybeSingle();
  if (!data || uploadState(data, auth.user.id, new Date()) !== "open") return null;
  // Still a member who may post for this brand (removed or made Viewer since: no more uploads).
  const { data: member } = await db
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", data.tenant_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!member || !isOrgRole(member.role) || !can(member.role, "posts.write")) return null;
  return { db, row: data, userId: auth.user.id };
}

const fileSchema = z.object({
  name: z.string().max(200),
  type: z.string().max(100),
  size: z.number().int().positive(),
});

/** A presigned upload for one file (the browser PUTs it to `uploadUrl`). */
export async function presignAddPhoto(
  uploadId: string,
  file: { name: string; type: string; size: number },
): Promise<{ uploadUrl: string; publicUrl: string } | { error: string }> {
  const parsed = fileSchema.safeParse(file);
  if (!parsed.success) return { error: "That file can't be added." };
  const open = await openUploadFor(uploadId);
  if (!open) return { error: "This link has expired. Ask your assistant for a new one." };
  if ((open.row.files as unknown[]).length >= ADD_PHOTOS_MAX) {
    return { error: `At most ${ADD_PHOTOS_MAX} photos or videos.` };
  }
  const kind = fileKind(parsed.data.type, parsed.data.size);
  if ("error" in kind) return kind;
  let signed: { uploadUrl: string; publicUrl: string };
  try {
    signed = await getSocialProvider().presignMedia({
      filename: `post-${Date.now()}.${kind.ext}`,
      contentType: parsed.data.type,
      size: parsed.data.size,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { uploadId, step: "presignAddPhoto" } });
    return { error: "The file couldn't be uploaded. Try again." };
  }
  // Remember the link we handed out (capped), so only it can be saved on this upload.
  const { data: issued } = await open.db.rpc("media_upload_issue", {
    p_id: uploadId,
    p_url: signed.publicUrl,
    p_max: ADD_PHOTOS_ISSUE_MAX,
  });
  if (!issued) return { error: "Too many uploads on this link. Ask your assistant for a new one." };
  return signed;
}

/** Records one uploaded file on the upload (after the browser's PUT succeeded). */
export async function saveAddedPhoto(
  uploadId: string,
  file: { url: string; name: string; type: string; size: number },
): Promise<AddPhotoResult> {
  const parsed = fileSchema.extend({ url: z.url() }).safeParse(file);
  if (!parsed.success) return { error: "That file can't be added." };
  const mock = resolveSocialProviderMode(process.env) === "mock";
  if (!isOurUploadUrl(parsed.data.url, { mock, appUrl: process.env.APP_URL })) {
    return { error: "Upload the file again." };
  }
  const open = await openUploadFor(uploadId);
  if (!open) return { error: "This link has expired. Ask your assistant for a new one." };
  const files = open.row.files as { url: string }[];
  if (files.some((f) => f.url === parsed.data.url)) return { ok: true };
  const kind = fileKind(parsed.data.type, parsed.data.size);
  if ("error" in kind) return kind;
  // Atomic: only a link issued for this upload, once, with room left (two tabs can't overfill).
  const { data: added, error } = await open.db.rpc("media_upload_add_file", {
    p_id: uploadId,
    p_file: {
      url: parsed.data.url,
      type: kind.type,
      name: parsed.data.name,
      size: parsed.data.size,
    },
    p_max: ADD_PHOTOS_MAX,
  });
  if (error) return { error: "Couldn't save it. Try again." };
  if (!added) {
    return files.length >= ADD_PHOTOS_MAX
      ? { error: `At most ${ADD_PHOTOS_MAX} photos or videos.` }
      : { error: "Upload the file again." };
  }
  return { ok: true };
}

/** Removes one added file (the ✕ on its row). */
export async function removeAddedPhoto(uploadId: string, url: string): Promise<AddPhotoResult> {
  const open = await openUploadFor(uploadId);
  if (!open) return { error: "This link has expired. Ask your assistant for a new one." };
  const files = (open.row.files as { url: string }[]).filter((f) => f.url !== url);
  const { error } = await open.db.from("media_uploads").update({ files }).eq("id", uploadId);
  if (error) return { error: "Couldn't remove it. Try again." };
  await writeAudit(open.db, {
    tenantId: open.row.tenant_id,
    action: "mcp_photo_removed",
    actor: open.userId,
    details: { uploadId },
  });
  return { ok: true };
}

/** Done: the files are ready for the assistant's preview. */
export async function finishAddPhotos(uploadId: string): Promise<AddPhotoResult> {
  const open = await openUploadFor(uploadId);
  if (!open) return { error: "This link has expired. Ask your assistant for a new one." };
  const count = (open.row.files as unknown[]).length;
  if (count === 0) return { error: "Add at least one photo or video first." };
  const { error } = await open.db
    .from("media_uploads")
    .update({ done_at: new Date().toISOString() })
    .eq("id", uploadId);
  if (error) return { error: "Couldn't save. Try again." };
  await writeAudit(open.db, {
    tenantId: open.row.tenant_id,
    action: "mcp_photos_added",
    actor: open.userId,
    details: { uploadId, files: count },
  });
  return { ok: true };
}
