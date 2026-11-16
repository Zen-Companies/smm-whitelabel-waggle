import type { InboxEntry } from "./inbox-data";

/** Each platform's own DM inbox on the web. */
const DM_INBOX: Record<string, string> = {
  instagram: "https://www.instagram.com/direct/inbox/",
  facebook: "https://www.facebook.com/messages/",
  tiktok: "https://www.tiktok.com/messages",
  bluesky: "https://bsky.app/messages",
  whatsapp: "https://web.whatsapp.com/",
};

/** Where to answer it yourself: the post for a comment, the platform's inbox for a DM. */
export function openOnPlatformHref(
  entry: Pick<InboxEntry, "kind" | "platform" | "permalink">,
): string | null {
  if (entry.kind === "comment" || entry.kind === "review") return entry.permalink;
  return DM_INBOX[entry.platform] ?? null;
}
