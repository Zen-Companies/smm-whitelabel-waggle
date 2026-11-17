// What a message carried besides words (T72): "Sent a photo" instead of "(no text)", and which
// attachment can be previewed. Only kinds are stored; links are fetched fresh when shown.

export type Attachment = { type: string; originalType?: string };

/** Pure: the stored `attachments` column, whatever shape it arrives in. */
export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a): Attachment[] =>
    a && typeof a === "object" && typeof (a as Attachment).type === "string"
      ? [
          {
            type: (a as Attachment).type,
            ...(typeof (a as Attachment).originalType === "string"
              ? { originalType: (a as Attachment).originalType }
              : {}),
          },
        ]
      : [],
  );
}

type Kind = "photo" | "video" | "voice" | "sticker" | "story" | "post" | "file";

function kindOf(a: Attachment): Kind {
  if (
    a.originalType === "story_mention" ||
    a.originalType === "ig_story" ||
    a.originalType === "story"
  )
    return "story";
  if (a.type === "share") return "post";
  if (a.type === "image") return "photo";
  if (a.type === "video") return "video";
  if (a.type === "audio") return "voice";
  if (a.type === "sticker") return "sticker";
  return "file";
}

const ONE: Record<Kind, string> = {
  photo: "Sent a photo",
  video: "Sent a video",
  voice: "Sent a voice message",
  sticker: "Sent a sticker",
  story: "Mentioned you in their story",
  post: "Shared a post",
  file: "Sent a file",
};
const MANY: Partial<Record<Kind, string>> = {
  photo: "photos",
  video: "videos",
  file: "files",
};

/** Pure: "Sent a photo", "Sent 3 photos", "Sent a photo and a video"; null with nothing. */
export function mediaLabel(attachments: Attachment[]): string | null {
  if (!attachments.length) return null;
  const kinds = attachments.map(kindOf);
  const unique = [...new Set(kinds)];
  if (unique.length === 1) {
    const k = unique[0];
    return kinds.length > 1 && MANY[k] ? `Sent ${kinds.length} ${MANY[k]}` : ONE[k];
  }
  if (unique.length === 2 && unique.every((k) => k === "photo" || k === "video")) {
    return "Sent photos and videos";
  }
  return `Sent ${attachments.length} things`;
}

/** Pure: what a message says, in words, for a list row or a preview line. */
export function messageWords(text: string, attachments: Attachment[]): string {
  return text.trim() || mediaLabel(attachments) || "Sent something without words";
}

/**
 * Platforms whose attachment links are plain CDN links Waggle can show without our API key
 * (docs.zernio.com/webhooks/inbox/message-received). WhatsApp media needs the key, so no preview.
 */
const PREVIEW_PLATFORMS = new Set(["instagram", "facebook", "telegram"]);

/** Pure: the position of the first photo to preview, or null. */
export function previewIndex(platform: string, attachments: Attachment[]): number | null {
  if (!PREVIEW_PLATFORMS.has(platform)) return null;
  const i = attachments.findIndex((a) => kindOf(a) === "photo" || kindOf(a) === "sticker");
  return i >= 0 ? i : null;
}
