import { inboxRules, platformOf } from "@/lib/social/platforms";

// T66 (design v3 "Settings · Accounts", NextAccountBadges): each connected account says what
// Waggle does there in plain words, plus a gray line only when something is different.

export interface AccountLines {
  does: string;
  note: string | null;
}

function list(parts: string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function accountLines(
  platform: string,
  extra: { pinterestBoardName?: string | null } = {},
): AccountLines {
  const p = platformOf(platform);
  if (!p) return { does: "Connected", note: null };
  const rules = inboxRules(platform);

  if (!p.inboxLive) {
    const pinNote =
      platform === "pinterest"
        ? extra.pinterestBoardName
          ? `Pins go to “${extra.pinterestBoardName}”`
          : "Pins go to your first board"
        : null;
    const later =
      p.kind === "answers" && (p.inbox.comments || p.inbox.dms || p.inbox.reviews)
        ? "Answering messages comes in an update"
        : null;
    return { does: "Posting only", note: pinNote ?? later };
  }

  const parts: string[] = [];
  if (p.inbox.comments) parts.push("comments");
  if (p.inbox.dms) parts.push(rules.dmWindow?.maxReplies ? "DM replies" : "DMs");
  if (p.inbox.reviews) parts.push(platform === "facebook" ? "Page reviews" : "reviews");
  const does = `Answers ${list(parts)}`;

  const notes: string[] = [];
  if (rules.commentsPolled) notes.push("Comments reach Waggle every few minutes");
  if (rules.dmWindow?.maxReplies) {
    notes.push(
      `DMs: replies only, ${rules.dmWindow.maxReplies} within ${rules.dmWindow.hours} hours`,
    );
  }
  return { does, note: notes.length ? notes.join(" · ") : null };
}
