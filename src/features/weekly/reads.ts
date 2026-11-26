import { hasLiveComments, inboxRules, isInboxLive, platformOf } from "@/lib/social/platforms";

// Weekly check-up (26 Nov): what can be read on each platform. Pure, tested.
//
// Comments: every platform whose comments Waggle answers (`GET /v1/inbox/comments`, nine platforms:
// docs.zernio.com/products/comments). DMs: `GET /v1/inbox/conversations` "Supported platforms:
// Facebook, Instagram, X, Bluesky, Reddit, Telegram, WhatsApp, iMessage, SMS, LINE and WeChat"
// (docs.zernio.com/messages/list-inbox-conversations, read 26 Nov), where Waggle's inbox runs.
// TikTok DMs, email and reviews aren't listed there: the check-up counts them from what Waggle has.

/** Platforms Zernio lists conversations for (its ids). */
export const CONVERSATION_PLATFORMS = [
  "facebook",
  "instagram",
  "twitter",
  "bluesky",
  "reddit",
  "telegram",
  "whatsapp",
  "imessage",
  "sms",
  "line",
] as const;

export function weeklyReads(platform: string): { comments: boolean; dms: boolean } {
  const p = platformOf(platform);
  const live = isInboxLive(platform);
  return {
    comments: hasLiveComments(platform),
    dms: live && !!p?.inbox.dms && (CONVERSATION_PLATFORMS as readonly string[]).includes(platform),
  };
}

/** How long after the customer's last message a DM can be answered; null: no window. */
export function replyWindowMs(platform: string): number | null {
  const w = inboxRules(platform).dmWindow;
  return w ? w.hours * 3_600_000 : null;
}
