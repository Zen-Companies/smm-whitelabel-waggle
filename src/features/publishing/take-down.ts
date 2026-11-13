// Take down a published post (T75c). Zernio's `POST /v1/posts/{postId}/unpublish` removes it
// from one platform at a time; Instagram, TikTok and Snapchat don't allow apps to remove posts,
// and on YouTube the removal is permanent (docs.zernio.com/posts/unpublish-post).

const REMOVABLE = new Set([
  "threads",
  "facebook",
  "twitter",
  "linkedin",
  "youtube",
  "pinterest",
  "reddit",
  "bluesky",
  "googlebusiness",
  "telegram",
]);

export const canTakeDown = (platform: string): boolean => REMOVABLE.has(platform);

/** Which of a post's platforms Waggle can remove it from, and which the owner must do by hand. */
export function takeDownSplit(platforms: readonly string[]): {
  removable: string[];
  byHand: string[];
} {
  const unique = [...new Set(platforms)];
  return {
    removable: unique.filter(canTakeDown),
    byHand: unique.filter((p) => !canTakeDown(p)),
  };
}

/**
 * The post's status after a take down: cancelled when nothing is left anywhere, else it stays
 * published (the platforms Waggle couldn't remove it from still show it).
 */
export function statusAfterTakeDown(removed: number, total: number): "cancelled" | "published" {
  return removed > 0 && removed === total ? "cancelled" : "published";
}
