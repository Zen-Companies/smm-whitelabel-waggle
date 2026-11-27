import { isSocialPlatform, type UpdatePostInput } from "@/lib/social/types";
import { targetExtras, type PostOptions } from "./post-options";
import { postMediaFromRow, type StoredMedia } from "./publish";

// Edit a planned post (Posts Round 3, approved 25 Nov): what changed between the saved post and
// the edited one, and the update Zernio gets for it (`PUT /v1/posts/{postId}`, only the fields
// that changed). Pure.

export interface EditablePost {
  content: string;
  media: StoredMedia[];
  accountIds: string[];
  /** `posts.platform_options` (per-platform text, choices, crops, YouTube title, board). */
  options: PostOptions;
  /** ISO, or null for "next free slot" before the queue picked a time. */
  scheduledFor: string | null;
}

export type EditPart = "text" | "media" | "accounts" | "options" | "time";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// The files by link: a kind Waggle only inferred later (an old row has none) is no change.
const mediaKey = (m: StoredMedia[]) => m.map((x) => x.url ?? "");
const sortedOptions = (o: PostOptions) =>
  Object.keys(o)
    .sort()
    .map((k) => [k, o[k] ? Object.entries(o[k]).sort(([a], [b]) => a.localeCompare(b)) : null]);

/** The parts of a post the edit changed, in a fixed order. */
export function editDiff(before: EditablePost, after: EditablePost): EditPart[] {
  const parts: EditPart[] = [];
  if (before.content !== after.content) parts.push("text");
  if (!same(mediaKey(before.media), mediaKey(after.media))) parts.push("media");
  if (!same([...before.accountIds].sort(), [...after.accountIds].sort())) parts.push("accounts");
  if (!same(sortedOptions(before.options), sortedOptions(after.options))) parts.push("options");
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  if (t(before.scheduledFor) !== t(after.scheduledFor)) parts.push("time");
  return parts;
}

/**
 * The update for the changed parts. The platforms list carries each platform's own text, crop and
 * choices, and a platform's own text is only "own" against the caption, so it goes whenever the
 * caption, the files, the accounts or the options changed.
 */
export function updateFields(
  parts: readonly EditPart[],
  after: EditablePost,
  accounts: readonly { platform: string; zernio_account_id: string }[],
  tiktokConsent: boolean,
): Omit<UpdatePostInput, "postId" | "idempotencyKey"> {
  const out: Omit<UpdatePostInput, "postId" | "idempotencyKey"> = {};
  if (parts.includes("text")) out.content = after.content;
  if (parts.includes("media")) out.media = postMediaFromRow(after.media);
  if (parts.some((p) => p !== "time")) {
    out.targets = accounts.flatMap((a) =>
      isSocialPlatform(a.platform)
        ? [{ platform: a.platform, accountId: a.zernio_account_id }]
        : [],
    );
    out.extras = Object.fromEntries(
      accounts.map((a) => [
        a.platform,
        targetExtras(a.platform, after.options[a.platform], after.content),
      ]),
    );
    out.tiktokConsent = tiktokConsent;
  }
  if (parts.includes("time") && after.scheduledFor) out.publishAt = new Date(after.scheduledFor);
  return out;
}
