import { platformLabel } from "@/lib/social/platforms";
import type { PostPlatformResult } from "@/lib/social/types";
import type { PostOptions } from "./post-options";

// "Fix the text" on a post that already went out (Posts Round 3, approved 25 Nov). Zernio's
// `POST /v1/posts/{postId}/edit` (docs.zernio.com/posts/edit-post, read 25 Nov) changes the text
// only, never the photo or video, on X (Premium, first hour), Discord, Facebook, Reddit,
// LinkedIn, Telegram, Pinterest, Google Business, YouTube (the description) and Slack.
// Instagram, TikTok, Threads, Bluesky and Snapchat don't allow it. Pure.

/**
 * Where Waggle offers it. Pinterest is left out: its pin-update endpoint is in closed beta and
 * Zernio rejects every edit there until Pinterest allowlists the app.
 */
const LIVE_EDIT = new Set([
  "facebook",
  "linkedin",
  "googlebusiness",
  "youtube",
  "twitter",
  "telegram",
  "reddit",
  "discord",
  "slack",
]);

export const canEditLive = (platform: string): boolean => LIVE_EDIT.has(platform);

const names = (ps: string[]) => {
  const n = ps.map(platformLabel);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

/** The post's live platforms split into the ones whose text can be fixed and the rest. */
export function liveEditSplit(platforms: readonly string[]): {
  editable: string[];
  notEditable: string[];
} {
  const unique = [...new Set(platforms)];
  return {
    editable: unique.filter(canEditLive),
    notEditable: unique.filter((p) => !canEditLive(p)),
  };
}

/**
 * The line under "Fix the text": where it changes, and where it can't. Null when every
 * platform allows it.
 */
export function liveEditNote(platforms: readonly string[]): string | null {
  const { editable, notEditable } = liveEditSplit(platforms);
  if (!notEditable.length) return null;
  const doesnt = `${names(notEditable)} ${notEditable.length > 1 ? "don't" : "doesn't"} allow editing a live post.`;
  if (!editable.length) return `${doesnt} Take it down and post again.`;
  return `Fix the text changes it on ${names(editable)}. ${doesnt}`;
}

/**
 * The live copies of a post: one per account that has it published. A published post saved
 * before per-platform results were kept has none: every account counts as live.
 */
export function liveCopies(
  results: readonly PostPlatformResult[],
  accounts: readonly { platform: string; zernio_account_id: string }[],
): { platform: string; accountId: string }[] {
  if (!results.length) {
    return accounts.map((a) => ({ platform: a.platform, accountId: a.zernio_account_id }));
  }
  return accounts.flatMap((a) => {
    const r =
      results.find((x) => x.accountId && x.accountId === a.zernio_account_id) ??
      results.find((x) => !x.accountId && x.platform === a.platform);
    return r?.status === "published"
      ? [{ platform: a.platform, accountId: a.zernio_account_id }]
      : [];
  });
}

/**
 * What the row keeps after the text was fixed on some platforms: the new text becomes the post's
 * text when every live platform has it; otherwise it's kept as those platforms' own text, so the
 * post still shows what most people see.
 */
export function afterLiveEdit(
  row: { content: string; options: PostOptions },
  livePlatforms: readonly string[],
  edited: readonly string[],
  text: string,
): { content: string; options: PostOptions } {
  const live = [...new Set(livePlatforms)];
  if (!edited.length) return row;
  if (live.every((p) => edited.includes(p))) {
    // Every copy says the new text: drop the old per-platform text of the edited platforms.
    const options = Object.fromEntries(
      Object.entries(row.options).map(([p, o]) => [
        p,
        o && edited.includes(p)
          ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== "text"))
          : o,
      ]),
    ) as PostOptions;
    return { content: text, options };
  }
  const options: PostOptions = { ...row.options };
  for (const p of edited) options[p] = { ...options[p], text };
  return { content: row.content, options };
}

/** "Fixed on Facebook and Google Business." with what didn't work, in the owner's words. */
export function liveEditOutcome(edited: string[], failed: { platform: string; reason: string }[]) {
  const parts: string[] = [];
  if (edited.length) parts.push(`Fixed on ${names(edited)}.`);
  for (const f of failed) parts.push(`${platformLabel(f.platform)}: ${f.reason}`);
  return parts.join(" ");
}
