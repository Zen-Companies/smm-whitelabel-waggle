import { randomUUID } from "node:crypto";
import type { ServiceClient } from "@/lib/supabase/service";

// Organization and brand pictures (T57). Stored in the public "pictures" bucket under a fresh,
// unguessable path on every change, so browsers never show a stale one. Only the server writes.

export const PICTURES_BUCKET = "pictures";
/** What we store: the cropped square the browser sends (512 × 512 PNG), or an account copy. */
export const PICTURE_MAX_BYTES = 2 * 1024 * 1024;
export const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const EXT: Record<(typeof PICTURE_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function pictureUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/${PICTURES_BUCKET}/${path}` : null;
}

export type PictureProblem = "type" | "size" | "empty";

export function checkPicture(file: { type: string; size: number }): PictureProblem | null {
  if (file.size === 0) return "empty";
  if (!(PICTURE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > PICTURE_MAX_BYTES) return "size";
  return null;
}

export const PICTURE_ERRORS: Record<PictureProblem | "failed", string> = {
  empty: "Pick a picture first.",
  type: "Only PNG or JPG pictures.",
  size: "That picture is over 2 MB. Pick a smaller one.",
  failed: "Couldn't upload. Try again.",
};

/** Stores a picture under `prefix/` and returns its path. */
export async function storePicture(
  db: ServiceClient,
  prefix: string,
  file: { type: string; bytes: ArrayBuffer | Uint8Array },
): Promise<string> {
  const ext = EXT[file.type as (typeof PICTURE_TYPES)[number]] ?? "png";
  const path = `${prefix}/${randomUUID()}.${ext}`;
  const { error } = await db.storage
    .from(PICTURES_BUCKET)
    .upload(path, file.bytes, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`picture upload failed: ${error.message}`);
  return path;
}

/** Removes a picture that is no longer used. A missing file is fine. */
export async function removePicture(db: ServiceClient, path: string | null | undefined) {
  if (!path) return;
  await db.storage.from(PICTURES_BUCKET).remove([path]);
}
