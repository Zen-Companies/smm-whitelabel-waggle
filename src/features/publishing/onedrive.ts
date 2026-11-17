import type { DriveItem } from "@/lib/social/types";
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_VIDEO_TYPES } from "./limits";

// OneDrive in the composer (T84c, design "Posts: files from Drive and OneDrive"): the brand's
// Outlook account, signed in with the `files` area, lists its OneDrive inside Waggle (no picker,
// docs.zernio.com/platforms/microsoft/files). A picked file is copied into post media storage,
// so posting works exactly like an upload. Google Drive is held: picking new Drive files opens
// a Google picker hosted on the partner's site.

/** Videos copied through the server; bigger ones are uploaded from the device instead. */
export const ONEDRIVE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export type DriveKind = "image" | "video" | "folder" | null;

export function driveKind(item: Pick<DriveItem, "kind" | "mimeType">): DriveKind {
  if (item.kind === "folder") return "folder";
  const type = item.mimeType ?? "";
  if ((POST_IMAGE_TYPES as readonly string[]).includes(type)) return "image";
  if ((POST_VIDEO_TYPES as readonly string[]).includes(type)) return "video";
  return null;
}

/** Folders and files a post can use, folders first; a reason when a file is too big. */
export function postableItems(items: DriveItem[]): (DriveItem & {
  use: "image" | "video" | "folder";
  tooBig: boolean;
})[] {
  return items
    .flatMap((i) => {
      const use = driveKind(i);
      if (!use) return [];
      const max = use === "image" ? POST_IMAGE_MAX_BYTES : ONEDRIVE_VIDEO_MAX_BYTES;
      return [{ ...i, use, tooBig: use !== "folder" && (i.size ?? 0) > max }];
    })
    .sort((a, b) =>
      a.use === "folder" && b.use !== "folder"
        ? -1
        : b.use === "folder" && a.use !== "folder"
          ? 1
          : a.name.localeCompare(b.name),
    );
}

/** A photo already in post media storage (copied from OneDrive), never any other address. */
export function isUploadedImageUrl(url: string, opts: { mock: boolean; appUrl?: string }): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/\.(jpe?g|png|webp)$/i.test(u.pathname)) return false;
  if (opts.mock) return !!opts.appUrl && url.startsWith(`${opts.appUrl}/api/mock-media/`);
  return u.protocol === "https:" && u.host === "media.zernio.com";
}
