// One entry per platform Zernio offers (docs/platforms/PLAN.md §2.1). Pages, the composer,
// connect, the inbox gate and analytics read from here, so adding a platform is one entry.
// The rules are hints for the screens; Zernio's validate call (SocialProvider.validatePost) is
// the final check before a post is saved, so a rule that changes upstream never breaks a post.
// Source: Zernio docs, checked 12 Nov 2026 (canvas page "Platform limits").

/** Zernio's platform ids, which are also what `social_accounts.platform` stores. */
export const PLATFORM_IDS = [
  "instagram",
  "facebook",
  "googlebusiness",
  "tiktok",
  "threads",
  "youtube",
  "linkedin",
  "bluesky",
  "twitter",
  "whatsapp",
  "telegram",
  "pinterest",
  "discord",
  "reddit",
  "snapchat",
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface PostRules {
  /** Characters allowed in the post text. */
  textMax: number;
  /** A photo or video is required (no text-only posts). */
  mediaRequired: boolean;
  /** Only video posts (YouTube). */
  videoOnly: boolean;
  /** Photos per post; 0 = photos aren't accepted. */
  maxImages: number;
  /** Image size Waggle checks before upload (bytes). */
  imageMaxBytes: number;
  /** Some photos are dropped (Google keeps only the first). */
  extraImagesDropped: boolean;
  /** Needs the owner's consent tick before each post (TikTok). */
  consentRequired: boolean;
  /** Longest video the platform takes, in seconds; null when we don't check (Zernio's call will). */
  videoMaxSeconds: number | null;
  /** A short "before it goes out" note, shown when this platform is ticked. */
  note: string | null;
}

export interface Platform {
  id: PlatformId;
  label: string;
  /** Neutral letter mark (no platform logos). */
  mark: { text: string; bg: string; fg: string };
  /**
   * answers: Waggle can answer messages here (comments, DMs or reviews).
   * posts: posting only (no inbox API).
   * soon: not available upstream yet.
   */
  kind: "answers" | "posts" | "soon";
  /**
   * How it connects. oauth: Zernio's hosted sign-in. password: handle + app password typed in
   * Waggle (Bluesky). code: a code sent to Zernio's bot (Telegram). setup: a step in Waggle not
   * built yet (WhatsApp signup, Discord channel).
   */
  connect: "oauth" | "password" | "code" | "setup" | "none";
  /** One line on the Connect tile: what Waggle does there. */
  line: string;
  /** A requirement shown under the line, or null. */
  needs: string | null;
  /** Posting rules; null where there's no feed to post to (WhatsApp). */
  post: PostRules | null;
  /** What the inbox can hold on this platform, per Zernio. */
  inbox: { comments: boolean; dms: boolean; reviews: boolean };
  /** Waggle's inbox handles this platform today (later waves turn the rest on). */
  inboxLive: boolean;
  /** Waggle's analytics pages cover this platform today. */
  analyticsLive: boolean;
}

const MB = 1024 * 1024;

const rules = (r: Partial<PostRules> & Pick<PostRules, "textMax">): PostRules => ({
  mediaRequired: false,
  videoOnly: false,
  maxImages: 10,
  imageMaxBytes: 5 * MB,
  extraImagesDropped: false,
  consentRequired: false,
  videoMaxSeconds: null,
  note: null,
  ...r,
});

export const PLATFORMS: Record<PlatformId, Platform> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    mark: { text: "IG", bg: "#FCE7F3", fg: "#9D174D" },
    kind: "answers",
    connect: "oauth",
    line: "Answers comments and DMs",
    needs: "Business or Creator account",
    post: rules({
      videoMaxSeconds: 900,
      textMax: 2200,
      mediaRequired: true,
      maxImages: 20,
      imageMaxBytes: 8 * MB,
    }),
    inbox: { comments: true, dms: true, reviews: false },
    inboxLive: true,
    analyticsLive: true,
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    mark: { text: "FB", bg: "#DBEAFE", fg: "#1E3A8A" },
    kind: "answers",
    connect: "oauth",
    line: "Answers comments, Messenger and reviews",
    needs: "A Page you manage",
    post: rules({ textMax: 63206, maxImages: 10, imageMaxBytes: 4 * MB }),
    inbox: { comments: true, dms: true, reviews: true },
    inboxLive: true,
    analyticsLive: true,
  },
  googlebusiness: {
    id: "googlebusiness",
    label: "Google Business",
    mark: { text: "G", bg: "#E0F2FE", fg: "#075985" },
    kind: "answers",
    connect: "oauth",
    line: "Answers your Google reviews",
    needs: "A verified location",
    post: rules({
      textMax: 1500,
      maxImages: 1,
      extraImagesDropped: true,
      note: "Shows only the first photo.",
    }),
    inbox: { comments: false, dms: false, reviews: true },
    inboxLive: true,
    analyticsLive: false,
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    mark: { text: "TT", bg: "#F4F4F5", fg: "#18181B" },
    kind: "answers",
    connect: "oauth",
    line: "Answers comments and replies to DMs",
    needs: "Business account; DMs not in the EU or UK",
    post: rules({
      videoMaxSeconds: 600,
      textMax: 2200,
      mediaRequired: true,
      maxImages: 35,
      imageMaxBytes: 20 * MB,
      consentRequired: true,
      note: "Posts publicly. You confirm TikTok's content check before it goes out.",
    }),
    inbox: { comments: true, dms: true, reviews: false },
    inboxLive: true,
    analyticsLive: false,
  },
  threads: {
    id: "threads",
    label: "Threads",
    mark: { text: "@", bg: "#F4F4F5", fg: "#18181B" },
    kind: "answers",
    connect: "oauth",
    line: "Answers comments",
    needs: "Instagram Business or Creator account",
    post: rules({ videoMaxSeconds: 300, textMax: 500, maxImages: 20, imageMaxBytes: 8 * MB }),
    inbox: { comments: true, dms: false, reviews: false },
    inboxLive: true,
    analyticsLive: false,
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    mark: { text: "YT", bg: "#FEE2E2", fg: "#991B1B" },
    kind: "answers",
    connect: "oauth",
    line: "Answers comments (checked every few minutes)",
    needs: "Video posts only",
    post: rules({ textMax: 5000, mediaRequired: true, videoOnly: true, maxImages: 0 }),
    inbox: { comments: true, dms: false, reviews: false },
    inboxLive: true,
    analyticsLive: false,
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    mark: { text: "in", bg: "#DBEAFE", fg: "#1E40AF" },
    kind: "answers",
    connect: "oauth",
    line: "Answers comments on your company page",
    needs: "Comments on company pages only",
    post: rules({ textMax: 3000, maxImages: 20, imageMaxBytes: 8 * MB }),
    inbox: { comments: true, dms: false, reviews: false },
    inboxLive: true,
    analyticsLive: false,
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    mark: { text: "B", bg: "#E0F2FE", fg: "#0369A1" },
    kind: "answers",
    connect: "password",
    line: "Answers comments and DMs",
    needs: "Needs an app password",
    post: rules({ videoMaxSeconds: 60, textMax: 300, maxImages: 4, imageMaxBytes: 1_000_000 }),
    inbox: { comments: true, dms: true, reviews: false },
    inboxLive: true,
    analyticsLive: false,
  },
  twitter: {
    id: "twitter",
    label: "X",
    mark: { text: "X", bg: "#F4F4F5", fg: "#18181B" },
    kind: "answers",
    connect: "oauth",
    line: "Answers mentions and DMs",
    needs: "Each X call costs extra",
    post: rules({
      videoMaxSeconds: 140,
      textMax: 280,
      maxImages: 4,
      note: "A post with a link costs more to send.",
    }),
    inbox: { comments: true, dms: true, reviews: false },
    inboxLive: false,
    analyticsLive: false,
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp",
    mark: { text: "WA", bg: "#DCFCE7", fg: "#166534" },
    kind: "answers",
    connect: "setup",
    line: "Answers chats within 24 hours",
    needs: "Needs a Meta Business account",
    post: null,
    inbox: { comments: false, dms: true, reviews: false },
    inboxLive: false,
    analyticsLive: false,
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    mark: { text: "TG", bg: "#E0F2FE", fg: "#075985" },
    kind: "answers",
    connect: "code",
    line: "Answers your group or channel",
    needs: "Add our bot as an admin",
    // 4,096 for text; a photo's caption allows 1,024 (Zernio's check catches that one).
    post: rules({ textMax: 4096, maxImages: 10, imageMaxBytes: 10 * MB }),
    inbox: { comments: false, dms: true, reviews: false },
    inboxLive: false,
    analyticsLive: false,
  },
  pinterest: {
    id: "pinterest",
    label: "Pinterest",
    mark: { text: "P", bg: "#FEE2E2", fg: "#991B1B" },
    kind: "posts",
    connect: "oauth",
    line: "Pins to a board you pick",
    needs: null,
    post: rules({
      textMax: 800,
      mediaRequired: true,
      maxImages: 1,
      extraImagesDropped: true,
      note: "Pins the first photo only.",
    }),
    inbox: { comments: false, dms: false, reviews: false },
    inboxLive: false,
    analyticsLive: false,
  },
  discord: {
    id: "discord",
    label: "Discord",
    mark: { text: "D", bg: "#EDE9FE", fg: "#5B21B6" },
    kind: "posts",
    connect: "setup",
    line: "Posts to one channel",
    needs: null,
    post: rules({ textMax: 2000, maxImages: 10, imageMaxBytes: 20 * MB }),
    inbox: { comments: false, dms: false, reviews: false },
    inboxLive: false,
    analyticsLive: false,
  },
  reddit: {
    id: "reddit",
    label: "Reddit",
    mark: { text: "R", bg: "#FFEDD5", fg: "#9A3412" },
    kind: "soon",
    connect: "none",
    line: "Turned off by Zernio for now",
    needs: null,
    post: null,
    inbox: { comments: true, dms: true, reviews: false },
    inboxLive: false,
    analyticsLive: false,
  },
  snapchat: {
    id: "snapchat",
    label: "Snapchat",
    mark: { text: "S", bg: "#FEF9C3", fg: "#854D0E" },
    kind: "soon",
    connect: "none",
    line: "Waiting for Snapchat to approve the connection",
    needs: null,
    post: null,
    inbox: { comments: false, dms: false, reviews: false },
    inboxLive: false,
    analyticsLive: false,
  },
};

export function isPlatformId(id: string): id is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(id);
}

/** The entry for a stored platform id; null for ids Waggle doesn't know. */
export function platformOf(id: string): Platform | null {
  return isPlatformId(id) ? PLATFORMS[id] : null;
}

/** "Instagram", "X"; an unknown id is shown as is. */
export const platformLabel = (id: string): string => platformOf(id)?.label ?? id;

/** Platforms a brand can connect from Waggle right now (Zernio's hosted sign-in). */
export const CONNECTABLE = PLATFORM_IDS.filter((id) => PLATFORMS[id].connect === "oauth");

export function isConnectable(id: string): id is PlatformId {
  return (CONNECTABLE as readonly string[]).includes(id);
}

/** Platforms that connect with a handle and an app password typed in Waggle (Bluesky). */
export const PASSWORD_CONNECT = PLATFORM_IDS.filter((id) => PLATFORMS[id].connect === "password");

/** Platforms with a setup card in Waggle (Bluesky's password, Telegram's code). */
export const SETUP_IN_WAGGLE = PLATFORM_IDS.filter(
  (id) => PLATFORMS[id].connect === "password" || PLATFORMS[id].connect === "code",
);

/** Platforms whose comments, DMs or reviews Waggle stores and answers today. */
export const INBOX_LIVE = PLATFORM_IDS.filter((id) => PLATFORMS[id].inboxLive);
export const isInboxLive = (id: string): boolean => platformOf(id)?.inboxLive ?? false;

/** Live platforms with comments: the ones a reconnect backfill reads (T16). */
export const COMMENTS_LIVE = INBOX_LIVE.filter((id) => PLATFORMS[id].inbox.comments);
export const hasLiveComments = (id: string): boolean =>
  (COMMENTS_LIVE as readonly string[]).includes(id);

/** Platforms Waggle's analytics pages cover today. */
export const ANALYTICS_LIVE = PLATFORM_IDS.filter((id) => PLATFORMS[id].analyticsLive);
export const isAnalyticsLive = (id: string): boolean => platformOf(id)?.analyticsLive ?? false;

/**
 * How the inbox behaves on a platform (T61/T62). Read by policy(), the send step, drafting and
 * the inbox screens. Source: Zernio docs (docs/platforms/RESEARCH.md), 12 Nov 2026.
 */
export interface InboxRules {
  /** Spam comments can be hidden on the post. Elsewhere spam is just left out of the inbox. */
  hide: boolean;
  /** A comment can be answered in the commenter's DMs (Meta's private reply). */
  privateReply: boolean;
  /**
   * DMs: replies are allowed this long after the customer's last message, at most `maxReplies`
   * of them (null: no cap). null: no window at all.
   */
  dmWindow: { hours: number; maxReplies: number | null } | null;
  /** Comments reach Zernio by polling, so they can arrive some minutes late. */
  commentsPolled: boolean;
  /** Longest reply the platform takes, in characters; null when it's far above any reply. */
  replyMax: number | null;
  /** Zernio can list a comment's replies (used to check an uncertain send went through). */
  listsReplies: boolean;
}

const NO_INBOX: InboxRules = {
  hide: false,
  privateReply: false,
  dmWindow: null,
  commentsPolled: false,
  replyMax: null,
  listsReplies: false,
};
const META: InboxRules = {
  hide: true,
  privateReply: true,
  dmWindow: { hours: 24, maxReplies: null },
  commentsPolled: false,
  replyMax: null,
  listsReplies: true,
};

// Hide: Threads, TikTok, X (Zernio /products/comments). Listing a comment's replies: Meta and
// TikTok only. Reply lengths are each platform's own comment limits (Zernio documents none).
const INBOX_RULES: Partial<Record<PlatformId, Partial<InboxRules>>> = {
  instagram: META,
  facebook: META,
  googlebusiness: { replyMax: 4096 },
  tiktok: {
    hide: true,
    dmWindow: { hours: 48, maxReplies: 10 },
    replyMax: 150,
    listsReplies: true,
  },
  threads: { hide: true, replyMax: 500 },
  youtube: { commentsPolled: true, replyMax: 10000 },
  linkedin: { commentsPolled: true, replyMax: 1250 },
  bluesky: { commentsPolled: true, replyMax: 300 },
  twitter: { hide: true, replyMax: 280 },
};

export function inboxRules(platform: string): InboxRules {
  const rules = isPlatformId(platform) ? INBOX_RULES[platform] : undefined;
  return { ...NO_INBOX, ...rules };
}
