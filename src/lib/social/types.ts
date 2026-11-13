import type {
  BestTimeSlot,
  DashboardSummary,
  Demographics,
  FollowerSeries,
  OnlineFollowers,
  PostTimelinePoint,
  ProviderPostMetrics,
} from "./analytics-types";

import { isPlatformId, PLATFORM_IDS, type PlatformId } from "./platforms";

/** Every platform Zernio offers (src/lib/social/platforms.ts has what each one allows). */
export const SOCIAL_PLATFORMS = PLATFORM_IDS;
export type SocialPlatform = PlatformId;
export const isSocialPlatform = isPlatformId;

/** Zernio's dry run of a post (`POST /v1/tools/validate/post`): per-platform problems. */
export interface PostValidation {
  valid: boolean;
  errors: { platform: string; message: string }[];
  warnings: { platform: string; message: string }[];
}

export interface CreatePostInput {
  content: string;
  /** Public HTTPS URLs (Zernio media presign flow, T14). */
  mediaUrls?: string[];
  targets: { platform: SocialPlatform; accountId: string }[];
  /** null publishes now. */
  publishAt: Date | null;
  idempotencyKey: string;
  /**
   * TikTok: the owner ticked "I've checked this post and agree to publish it" (TikTok requires it
   * on every post). Without it a TikTok target is refused.
   */
  tiktokConsent?: boolean;
  /** YouTube's video title (100 max); without it Zernio uses the caption's first line. */
  youtubeTitle?: string;
  /** Pinterest's board (T64); without it Zernio pins to the account's first board. */
  pinterestBoardId?: string;
  /**
   * Per platform (T75): text for that platform only and its `platformSpecificData` (post type,
   * first comment, YouTube/Instagram/Facebook options), already filtered to what it accepts.
   * When given for a platform it replaces `youtubeTitle` / `pinterestBoardId` there.
   */
  extras?: Partial<Record<string, TargetExtras>>;
  /**
   * T75: post in the brand's next free queue slot (`queuedFromProfile`); Zernio picks and holds
   * the time. Wins over `publishAt`.
   */
  queueProfileId?: string;
}

/** A brand's posting times (`/v1/queue/slots`, T75): dayOfWeek 0 = Sunday, time "HH:mm". */
export type PostingQueue = {
  timezone: string;
  slots: { dayOfWeek: number; time: string }[];
  /** The next free times, ISO, soonest first. */
  nextSlots: string[];
};

/** One target's extra createPost fields (T75). */
export type TargetExtras = {
  customContent?: string;
  platformSpecificData?: Record<string, unknown>;
};

/** A video (or other file) is a video when its URL ends like one; Zernio reads the same. */
export const isVideoUrl = (url: string): boolean =>
  /\.(mp4|mov|webm|m4v|mpeg|avi)(\?|$)/i.test(url);

export type ProviderPostStatus =
  | "draft"
  | "pending_approval"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";

export interface ProviderMessage {
  id: string;
  direction: "incoming" | "outgoing";
  text: string | null;
  createdAt: string;
}

export interface ProviderCommentReply {
  id: string;
  text: string | null;
  /** Written by the connected account (our own reply). */
  fromOwner: boolean;
  createdAt: string | null;
}

/** Per call: abort after the job's budget (docs/tdd.md §7.2). Defaults to the adapter timeout. */
export interface CallOptions {
  signal?: AbortSignal;
}

/** A top-level comment on a post (inbox backfill, T16). Ids are the platform's, as in webhooks. */
export interface ProviderComment {
  id: string;
  text: string;
  authorName: string | null;
  fromOwner: boolean;
  createdAt: string | null;
}

/** A review (recommendation) on a connected Facebook Page (T42). Ids are Zernio's. */
export interface ProviderReview {
  id: string;
  reviewerName: string | null;
  /** Facebook: true = recommends, false = doesn't recommend, null = not given. */
  recommends: boolean | null;
  /** Google: 1–5 stars; null elsewhere. */
  rating?: number | null;
  text: string;
  createdAt: string;
  hasReply: boolean;
  /** Link to the review on Facebook, when Zernio gives one. */
  reviewUrl: string | null;
}

/** Zernio's spend this billing cycle, split by profile (= tenant). T17. */
export interface ProviderUsage {
  periodStart: string | null;
  periodEnd: string | null;
  totalUsd: number;
  /** Credits, 10DLC, Verify: not tied to a profile. */
  unattributedUsd: number;
  byProfile: { profileId: string; totalUsd: number }[];
}

/** A connected account's picture on its platform (T57). The link may expire: copy it. */
export interface AccountPicture {
  accountId: string;
  pictureUrl: string | null;
}

export interface AccountHealth {
  accountId: string;
  platform: string;
  username: string | null;
  status: "healthy" | "warning" | "error";
  needsReconnect: boolean;
  canPost: boolean;
  issues: string[];
}

export type TelegramConnectStatus =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "connected"; accountId: string | null; username: string | null };

import type { WhatsAppTemplate } from "./whatsapp-templates";

// Zernio sits behind this interface (CLAUDE.md rule 1). Ids are Zernio ids.
export type PhoneNumberType = "local" | "mobile" | "national" | "toll_free";

/** A country's phone number offer (T82a, `GET /v1/phone-numbers/countries`). */
export interface PhoneCountry {
  code: string;
  types: {
    numberType: PhoneNumberType;
    monthlyCents: number;
    needsKyc: boolean;
    callsAvailable: boolean;
    smsAvailable: boolean;
    inStock: boolean;
    /** "request": the number is ordered, not handed over at once. */
    instant: boolean;
  }[];
}

/** A number the brand owns (`GET /v1/phone-numbers?profileId`). */
export interface OwnedNumber {
  id: string;
  phoneNumber: string;
  country: string;
  numberType: string | null;
  status: string;
  monthlyCents: number | null;
}

export type PurchaseResult =
  | { kind: "bought"; id: string; phoneNumber: string; profileId: string | null }
  /** The country needs an ID check, or the team needs a card: Waggle never shows the link. */
  | { kind: "needs_id" }
  | { kind: "needs_payment" };

/** A calendar event (T81d, `GET /v1/calendar/events`): times keep the calendar's own offset. */
export interface CalendarEventSummary {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  /** False for events marked free; cancelled ones are left out. */
  busy: boolean;
}

/** Where an email address connects (T80b, `POST /v1/email/imap/discover`). */
export interface EmailDiscovery {
  route: "imap" | "google_oauth" | "microsoft_oauth" | "unsupported";
  providerName: string | null;
  /** App password label, e.g. "App-specific password"; null when none is named. */
  passwordLabel: string | null;
  helpUrl: string | null;
  steps: string[];
  /** Settings to switch on at the provider first. */
  preflight: { text: string; url: string | null }[];
}

/** A site, shop or tool connected on the profile (T80: shopify, wordpress, webflow, ...). */
export interface Integration {
  id: string;
  platform: string;
  name: string;
  active: boolean;
}

/** What the owner pastes to connect a site with their own keys (T80, nothing installed). */
export type SiteKeys =
  | { kind: "shopify"; shop: string; accessToken: string }
  | { kind: "wordpress"; siteUrl: string; username: string; applicationPassword: string }
  | { kind: "webflow"; siteToken: string };

/** An ads connection on the profile (T79, `metaads`, `googleads`, ...). */
export interface AdConnection {
  id: string;
  platform: string;
  name: string;
  /** The posting account it was connected from (classic Meta connect). */
  parentAccountId: string | null;
  active: boolean;
}

/** An ad account an ads connection reaches (`GET /v1/ads/accounts`). */
export interface AdAccount {
  id: string;
  name: string;
  currency: string;
  minDailyBudget: number | null;
  /** Whether the ad account has a payment method (Meta). */
  billing: "ok" | "missing" | "unknown";
  usable: boolean;
}

export type AdCampaignStatus =
  "active" | "paused" | "pending_review" | "rejected" | "completed" | "cancelled" | "error";

/** A campaign as listed (`GET /v1/ads/campaigns`). Money in whole currency units. */
export interface AdCampaignSummary {
  id: string;
  platform: string;
  name: string;
  status: AdCampaignStatus;
  budget: { amount: number; type: "daily" | "lifetime" } | null;
  currency: string | null;
  spend: number;
  reach: number;
  clicks: number;
}

/** An automated ad rule (`/v1/ads/rules`); its name says what it does. */
export interface AdRuleSummary {
  id: string;
  name: string;
  adAccountId: string;
  enabled: boolean;
}

/** A lead form in an ad (T78c, `/v1/ads/lead-forms`). */
export interface LeadForm {
  id: string;
  name: string;
  status: string;
}

export type AdLeadStatus =
  "new" | "contacted" | "unreachable" | "qualified" | "converted" | "disqualified";

/** A lead from an ad's form (T78c, `/v1/ads/leads`). */
export interface AdLead {
  id: string;
  formName: string;
  createdAt: string | null;
  /** Question key → answer. */
  fields: Record<string, string>;
  consents: { checkboxKey: string; isChecked: boolean }[];
  status: AdLeadStatus;
  /** Set when Zernio already linked a contact. */
  contactId: string | null;
}

/** A broadcast as listed (T78b, `/v1/broadcasts`). */
export interface Broadcast {
  id: string;
  name: string;
  platform: string;
  status: "draft" | "scheduled" | "sending" | "completed" | "failed" | "cancelled";
  preview: string;
  scheduledAt: string | null;
  completedAt: string | null;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

/** A contact (T78a, `/v1/contacts`). */
export interface Contact {
  id: string;
  name: string;
  email: string | null;
  tags: string[];
  /** Agreed to get messages. */
  subscribed: boolean;
  /** Where they can be messaged, e.g. whatsapp and "+639175550142". */
  platform: string | null;
  identifier: string | null;
  lastMessageAt: string | null;
}

/** A Zernio workflow graph (T77b, `/v1/workflows`): nodes, edges and the trigger node. */
export interface WorkflowGraph {
  nodes: { id: string; type: string; config?: Record<string, unknown>; label?: string }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string }[];
  entryNodeId: string;
}

/** One sequence step as Zernio takes it (T77c): a wait, then a message or a WhatsApp template. */
export type SequenceStep = {
  order: number;
  delayMinutes: number;
  message?: { text: string };
  template?: {
    name: string;
    language: string;
    variableMapping?: Record<string, { field: "name" | "phone" | "email" | "company" | "custom" }>;
  };
};

/** A sequence as listed (T77c). */
export interface Sequence {
  id: string;
  name: string;
  platform: string;
  /** Zernio account id it sends from. */
  accountId: string;
  status: "draft" | "active" | "paused";
  steps: number;
  preview: string;
  enrolled: number;
  completed: number;
  exited: number;
}

/** A chat flow as listed (T77b). */
export interface ChatFlow {
  id: string;
  name: string;
  /** Free text; a link flow (T77d) keeps its ig.me / m.me link here. */
  description: string;
  platform: string;
  status: "draft" | "active" | "paused";
  started: number;
  completed: number;
}

/** A comment-to-DM automation (T77a, `/v1/comment-automations`). */
export interface CommentAutomation {
  id: string;
  name: string;
  platform: string;
  /** Zernio account id. */
  accountId: string;
  keywords: string[];
  matchMode: "exact" | "contains" | "word";
  dmMessage: string | null;
  button: { title: string; url: string } | null;
  commentReply: string | null;
  /** Only once per person (else every comment). */
  once: boolean;
  /** A specific post's title, or null for any post. */
  postTitle: string | null;
  isActive: boolean;
  stats: { triggered: number; dmsSent: number; dmsFailed: number; linkClicks: number };
}

export interface CommentAutomationInput {
  name: string;
  accountId: string;
  keywords: string[];
  matchMode: "exact" | "contains" | "word";
  dmMessage?: string;
  button?: { title: string; url: string };
  commentReply?: string;
  once: boolean;
}

/** One comment an automation answered, skipped or failed on (the owner sees it; never logged). */
export interface CommentAutomationLogEntry {
  id: string;
  who: string;
  status: "pending" | "sent" | "failed" | "skipped" | "gated";
  at: string | null;
}

export interface SocialProvider {
  /** A 409 for the same externalId returns the existing profile with `alreadyExisted: true`. */
  createProfile(input: {
    name: string;
    externalId: string;
    idempotencyKey?: string;
  }): Promise<{ profileId: string; alreadyExisted: boolean }>;
  getConnectUrl(input: {
    platform: SocialPlatform;
    profileId: string;
    redirectUrl: string;
  }): Promise<{ authUrl: string }>;
  /**
   * Bluesky (T60): connects with the handle and an app password typed in Waggle
   * (`POST /v1/connect/bluesky/credentials`; state `{userId}-{profileId}`, userId is
   * `currentUserId` from `GET /v1/users`). Returns the account when Zernio includes it in the
   * response; account.connected follows by webhook either way. The password is never stored.
   */
  connectBluesky(
    input: { profileId: string; identifier: string; appPassword: string } & CallOptions,
  ): Promise<{ account: { accountId: string; username: string | null } | null }>;
  /**
   * Telegram (T60): an access code for Zernio's bot (`GET /v1/connect/telegram`), valid 15
   * minutes. The owner makes the bot an admin of their channel or group and sends it the code.
   */
  startTelegramConnect(
    input: { profileId: string } & CallOptions,
  ): Promise<{ code: string; expiresAt: string; botUsername: string }>;
  /** Whether the code has been sent yet (`PATCH /v1/connect/telegram?code=`). */
  checkTelegramConnect(input: { code: string } & CallOptions): Promise<TelegramConnectStatus>;
  createPost(
    input: CreatePostInput,
  ): Promise<{ providerPostId: string; status: ProviderPostStatus; scheduledFor?: string | null }>;
  /**
   * Gmail or Outlook sign-in (T81c), asking for the mailbox and calendar areas. No welcome
   * screen: from the API the owner sees only Google's or Microsoft's own pages.
   */
  getMailConnectUrl(
    input: {
      platform: "google" | "microsoft";
      profileId: string;
      redirectUrl: string;
      scopes: readonly ("email" | "calendar")[];
    } & CallOptions,
  ): Promise<{ authUrl: string }>;
  /** Countries and number types Zernio sells, with monthly prices (T82a). */
  listPhoneCountries(input?: CallOptions): Promise<PhoneCountry[]>;
  /** Numbers for sale; padded "best effort" results are left out. */
  searchPhoneNumbers(
    input: { country: string; numberType: PhoneNumberType; areaCode?: string } & CallOptions,
  ): Promise<{ phoneNumber: string; locality: string | null; features: string[] }[]>;
  /**
   * Buys a number for calls (and texts where offered), never WhatsApp. `purchaseIntentId` makes
   * a retry return the same number.
   */
  purchasePhoneNumber(
    input: {
      profileId: string;
      country: string;
      numberType: PhoneNumberType;
      phoneNumber: string;
      wantsSms: boolean;
      purchaseIntentId: string;
    } & CallOptions,
  ): Promise<PurchaseResult>;
  /** The profile's numbers, released ones left out. */
  listOwnedNumbers(input: { profileId: string } & CallOptions): Promise<OwnedNumber[]>;
  /** Gives the number back. Can't be undone. */
  releasePhoneNumber(input: { id: string } & CallOptions): Promise<void>;
  /** The primary calendar's events between `from` and `to` (T81d), cancelled ones left out. */
  listCalendarEvents(
    input: { accountId: string; from: string; to: string } & CallOptions,
  ): Promise<CalendarEventSummary[]>;
  /** Adds an event to the primary calendar (T81d); not idempotent upstream, one attempt. */
  createCalendarEvent(
    input: {
      accountId: string;
      title: string;
      start: string;
      end: string;
      description?: string;
    } & CallOptions,
  ): Promise<{ id: string }>;
  /** Every account on the profile whose platform is in `platforms` (T80). */
  listIntegrations(
    input: { profileId: string; platforms: readonly string[] } & CallOptions,
  ): Promise<Integration[]>;
  /** Connects a site with the owner's own keys (T80); Zernio checks them before saving. */
  connectSiteWithKeys(
    input: { profileId: string; keys: SiteKeys } & CallOptions,
  ): Promise<{ accountId: string; name: string }>;
  /** Finds an email address's provider and settings (T80b); 20 a minute upstream. */
  discoverEmail(input: { email: string } & CallOptions): Promise<EmailDiscovery>;
  /**
   * Connects a mailbox with its (app) password (T80b). Zernio signs in to IMAP and SMTP before
   * storing anything; a failed check is a 422 with the provider's fix in `details.info`.
   */
  connectEmail(
    input: { profileId: string; email: string; password: string; name?: string } & CallOptions,
  ): Promise<void>;
  /** Connects a LINE Official Account with its channel keys (T80b). */
  connectLine(
    input: { profileId: string; channelId: string; channelSecret: string } & CallOptions,
  ): Promise<{ accountId: string; name: string; webhookReady: boolean }>;
  /** Connects WhatsApp with the business's own Meta keys (T80). */
  connectWhatsAppWithKeys(
    input: {
      profileId: string;
      accessToken: string;
      wabaId: string;
      phoneNumberId: string;
      pin?: string;
    } & CallOptions,
  ): Promise<{ accountId: string; username: string }>;
  /**
   * Connects Meta ads from the brand's Facebook account (classic login, T79). Returns the
   * `metaads` connection when no consent is needed, otherwise Meta's consent link.
   */
  connectMetaAds(
    input: { profileId: string; facebookAccountId: string; redirectUrl: string } & CallOptions,
  ): Promise<{ connectionId: string } | { authUrl: string }>;
  /** The profile's ads connections. */
  listAdConnections(input: { profileId: string } & CallOptions): Promise<AdConnection[]>;
  listAdAccounts(input: { connectionId: string } & CallOptions): Promise<AdAccount[]>;
  /** Boosts a published post (`POST /v1/ads/boost`); never retried without the same key. */
  boostPost(
    input: { body: Record<string, unknown>; idempotencyKey: string } & CallOptions,
  ): Promise<{ id: string; status: AdCampaignStatus }>;
  listAdCampaigns(input: { connectionId: string } & CallOptions): Promise<AdCampaignSummary[]>;
  setAdCampaignStatus(
    input: { campaignId: string; platform: string; status: "active" | "paused" } & CallOptions,
  ): Promise<void>;
  listAdRules(input: { connectionId: string } & CallOptions): Promise<AdRuleSummary[]>;
  createAdRule(input: { body: Record<string, unknown> } & CallOptions): Promise<{ id: string }>;
  setAdRuleEnabled(input: { id: string; enabled: boolean } & CallOptions): Promise<void>;
  deleteAdRule(input: { id: string } & CallOptions): Promise<void>;
  /** A Facebook Page's lead forms (T78c). */
  listLeadForms(input: { accountId: string } & CallOptions): Promise<LeadForm[]>;
  /** Creates a lead form on the Page (Meta shape; never retried: not idempotent upstream). */
  createLeadForm(input: { body: Record<string, unknown> } & CallOptions): Promise<{ id: string }>;
  /** Leads from these accounts' forms, newest first. */
  listAdLeads(
    input: { accountIds: string[]; status?: AdLeadStatus } & CallOptions,
  ): Promise<AdLead[]>;
  updateAdLeadStatus(input: { id: string; status: AdLeadStatus } & CallOptions): Promise<void>;
  /** The brand's broadcasts, newest first (T78b). */
  listBroadcasts(input: { profileId: string } & CallOptions): Promise<Broadcast[]>;
  /**
   * A WhatsApp broadcast to everyone subscribed (with `tag`, only them), filled from that
   * audience; returns how many it will reach.
   */
  createWhatsAppBroadcast(
    input: {
      profileId: string;
      accountId: string;
      name: string;
      template: { name: string; language: string; nameVariable: boolean };
      tag: string | null;
    } & CallOptions,
  ): Promise<{ id: string; recipients: number }>;
  /** Sends now, or at `at` (ISO). */
  startBroadcast(input: { id: string; at: string | null } & CallOptions): Promise<void>;
  cancelBroadcast(input: { id: string } & CallOptions): Promise<void>;
  /** The brand's contacts, newest first, 50 a page (T78a). */
  listContacts(
    input: { profileId: string; search?: string; tag?: string; skip?: number } & CallOptions,
  ): Promise<{ contacts: Contact[]; total: number }>;
  /** One contact; with `channel`, reachable there (e.g. a WhatsApp number). */
  createContact(
    input: {
      profileId: string;
      name: string;
      email?: string;
      tags: string[];
      subscribed: boolean;
      channel?: { accountId: string; platform: string; identifier: string };
    } & CallOptions,
  ): Promise<{ id: string }>;
  /** Up to 1,000 at once; with `accountId`, each row's `identifier` is its handle there. */
  importContacts(
    input: {
      profileId: string;
      accountId?: string;
      rows: { name: string; identifier?: string; email?: string; tags: string[] }[];
    } & CallOptions,
  ): Promise<{ created: number; skipped: number; errors: number }>;
  /** Change a contact's tags or whether they agreed to get messages. */
  updateContact(
    input: { id: string; tags?: string[]; subscribed?: boolean } & CallOptions,
  ): Promise<void>;
  /** The brand's sequences (T77c, `GET /v1/sequences`). */
  listSequences(input: { profileId: string } & CallOptions): Promise<Sequence[]>;
  /** Creates a sequence as a draft. */
  createSequence(
    input: {
      profileId: string;
      accountId: string;
      platform: string;
      name: string;
      steps: SequenceStep[];
      exitOnReply: boolean;
      exitOnUnsubscribe: boolean;
    } & CallOptions,
  ): Promise<{ id: string }>;
  setSequenceActive(input: { id: string; active: boolean } & CallOptions): Promise<void>;
  deleteSequence(input: { id: string } & CallOptions): Promise<void>;
  /** Adds contacts (Zernio contact ids); people already in it or not reachable there fail. */
  enrollInSequence(
    input: { id: string; contactIds: string[] } & CallOptions,
  ): Promise<{ enrolled: number; failed: number }>;
  /** Ids of the brand's subscribed contacts with a tag on one account (up to 1,000). */
  listContactIdsByTag(
    input: { profileId: string; accountId: string; tag: string } & CallOptions,
  ): Promise<string[]>;
  /** The brand's chat flows (T77b, `GET /v1/workflows`). */
  listWorkflows(input: { profileId: string } & CallOptions): Promise<ChatFlow[]>;
  /** Creates a flow as a draft (`POST /v1/workflows`). */
  createWorkflow(
    input: {
      profileId: string;
      accountId: string;
      platform: string;
      name: string;
      description?: string;
      graph: WorkflowGraph;
    } & CallOptions,
  ): Promise<{ id: string }>;
  /** Turns a flow on (`/activate`) or pauses it (`/pause`). */
  setWorkflowActive(input: { id: string; active: boolean } & CallOptions): Promise<void>;
  deleteWorkflow(input: { id: string } & CallOptions): Promise<void>;
  /** The brand's comment-to-DM automations (T77a). */
  listCommentAutomations(input: { profileId: string } & CallOptions): Promise<CommentAutomation[]>;
  createCommentAutomation(
    input: {
      profileId: string;
      automation: CommentAutomationInput;
      isActive: boolean;
    } & CallOptions,
  ): Promise<{ id: string }>;
  /** Edits an automation; any field left out stays as it is. */
  updateCommentAutomation(
    input: {
      id: string;
      automation?: CommentAutomationInput;
      isActive?: boolean;
    } & CallOptions,
  ): Promise<void>;
  deleteCommentAutomation(input: { id: string } & CallOptions): Promise<void>;
  /** The latest comments it acted on, newest first, and how many comments matched no keyword. */
  listCommentAutomationLogs(
    input: { id: string; limit?: number } & CallOptions,
  ): Promise<{ entries: CommentAutomationLogEntry[]; misses: number }>;
  /** The brand's default queue, or null when it has none yet (T75). */
  getQueue(input: { profileId: string } & CallOptions): Promise<PostingQueue | null>;
  /** Replaces the brand's default queue (creates it the first time). */
  saveQueue(
    input: {
      profileId: string;
      timezone: string;
      slots: { dayOfWeek: number; time: string }[];
    } & CallOptions,
  ): Promise<PostingQueue>;
  /**
   * Checks a post against each platform's real rules without publishing
   * (`POST /v1/tools/validate/post`, same body as createPost). The composer's last check.
   */
  validatePost(
    input: Omit<CreatePostInput, "publishAt" | "idempotencyKey"> & CallOptions,
  ): Promise<PostValidation>;
  /**
   * Uploads one image for a post: `POST /v1/media/presign` then a PUT of the bytes to the
   * returned `uploadUrl`. Returns the public URL to pass in `CreatePostInput.mediaUrls`.
   */
  /**
   * A presigned upload for the browser to PUT a file to (videos: too big for our server). The
   * storage allows any origin (checked 12 Nov 2026). `uploadUrl` lasts 1 hour; the file at
   * `publicUrl` 7 days until a post uses it.
   */
  presignMedia(
    input: { filename: string; contentType: string; size: number } & CallOptions,
  ): Promise<{ uploadUrl: string; publicUrl: string }>;
  /** A Pinterest account's boards (`GET /v1/accounts/{accountId}/pinterest-boards`, T64). */
  listPinterestBoards(
    input: { accountId: string } & CallOptions,
  ): Promise<{ id: string; name: string }[]>;
  uploadMedia(
    input: {
      filename: string;
      contentType: string;
      bytes: Uint8Array;
    } & CallOptions,
  ): Promise<{ publicUrl: string }>;
  /** Cancels a scheduled post (`DELETE /v1/posts/{postId}`). */
  deletePost(input: { postId: string } & CallOptions): Promise<void>;
  /**
   * Removes a published post from one platform (`POST /v1/posts/{postId}/unpublish`, T75c).
   * Not on Instagram, TikTok or Snapchat; permanent on YouTube.
   */
  unpublishPost(
    input: { postId: string; platform: string; accountId?: string } & CallOptions,
  ): Promise<void>;
  /** `postId` is the Zernio post id or the platform's post id. */
  replyToComment(
    input: {
      accountId: string;
      postId: string;
      commentId: string;
      message: string;
      idempotencyKey: string;
    } & CallOptions,
  ): Promise<{ providerReplyId: string }>;
  /**
   * Hides a comment on its post (`POST /v1/inbox/comments/{postId}/{commentId}/hide`, T40): only
   * the commenter and the account see it. `unhideComment` is `DELETE` on the same path. A comment
   * that no longer exists answers 400 (code PLATFORM_API_ERROR).
   */
  hideComment(
    input: { accountId: string; postId: string; commentId: string } & CallOptions,
  ): Promise<void>;
  unhideComment(
    input: { accountId: string; postId: string; commentId: string } & CallOptions,
  ): Promise<void>;
  /**
   * Answers a comment in the commenter's DMs (`POST /v1/inbox/comments/{postId}/{commentId}/
   * private-reply`, T41). Meta allows one per comment, within 7 days; a second answers 400 with
   * `privateReplyConsumed`. No idempotency key: that single use is what stops a double send.
   */
  sendPrivateReply(
    input: {
      accountId: string;
      postId: string;
      commentId: string;
      message: string;
    } & CallOptions,
  ): Promise<{ providerMessageId: string }>;
  /**
   * An account's reviews, newest first (`GET /v1/inbox/reviews?platform=…&accountId=…`).
   * Facebook (T42) sends no review webhooks, so the job polls this; Google (T61) uses it to check
   * an uncertain reply. `platform` defaults to facebook. Zernio caches each listing ~60 s.
   */
  listReviews(
    input: { accountId: string; platform?: string; limit?: number } & CallOptions,
  ): Promise<ProviderReview[]>;
  // Analytics reads (T48). Called by the sync job only; pages read the stored copies.
  /** `GET /v1/analytics/dashboard` for one window, with the previous window to compare. */
  getAnalyticsDashboard(
    input: {
      profileId: string;
      fromDate: string;
      toDate: string;
      platform?: SocialPlatform;
    } & CallOptions,
  ): Promise<DashboardSummary>;
  /** `GET /v1/analytics`: posts published in the window with lifetime numbers, one page. */
  listPostAnalytics(
    input: { profileId: string; fromDate: string; toDate: string; page: number } & CallOptions,
  ): Promise<{ posts: ProviderPostMetrics[]; pages: number }>;
  /** `GET /v1/accounts/follower-stats`, daily (refreshed once a day upstream). */
  getFollowerStats(
    input: { profileId: string; fromDate: string; toDate: string } & CallOptions,
  ): Promise<FollowerSeries[]>;
  /**
   * Google Business Profile's performance report (T76): metric name → total over the window
   * (`GET /v1/analytics/googlebusiness/performance`; 2–3 days behind).
   */
  getGoogleBusinessPerformance(
    input: { accountId: string; fromDate: string; toDate: string } & CallOptions,
  ): Promise<Record<string, number>>;
  /** `GET /v1/analytics/best-time`: slots by average engagement, best first (UTC hours). */
  getBestTimeToPost(input: { profileId: string } & CallOptions): Promise<BestTimeSlot[]>;
  /** Instagram (age, gender, city, country) or Facebook (country, city) follower breakdown. */
  getDemographics(
    input: { accountId: string; platform: SocialPlatform } & CallOptions,
  ): Promise<Demographics | null>;
  /** Instagram followers online per hour, last 30 days. */
  getOnlineFollowers(input: { accountId: string } & CallOptions): Promise<OnlineFollowers | null>;
  /** `GET /v1/analytics/post-timeline`: a post's numbers day by day. */
  getPostTimeline(
    input: { postId: string; fromDate?: string; toDate?: string } & CallOptions,
  ): Promise<PostTimelinePoint[]>;
  /** Public reply under a review (`POST /v1/inbox/reviews/{reviewId}/reply`, Idempotency-Key). */
  replyToReview(
    input: {
      accountId: string;
      reviewId: string;
      message: string;
      idempotencyKey: string;
    } & CallOptions,
  ): Promise<{ providerReplyId: string }>;
  /**
   * `template` (WhatsApp, T67): send an approved template instead of free text, the only kind
   * WhatsApp allows 24 hours after the customer's last message. `message` is then the rendered
   * text, for our records only.
   */
  sendDm(
    input: {
      accountId: string;
      conversationId: string;
      message: string;
      idempotencyKey: string;
      template?: { name: string; language: string; params: string[] };
    } & CallOptions,
  ): Promise<{ providerMessageId: string }>;
  /** A WhatsApp account's templates, read live from Meta (`GET /v1/whatsapp/templates`). */
  listWhatsAppTemplates(input: { accountId: string } & CallOptions): Promise<WhatsAppTemplate[]>;
  /** A new template, sent to Meta for review (`POST /v1/whatsapp/templates`). */
  createWhatsAppTemplate(
    input: {
      accountId: string;
      name: string;
      category: "UTILITY" | "MARKETING";
      language: string;
      body: string;
      /** One example per {{n}}, for Meta's reviewers. */
      examples: string[];
    } & CallOptions,
  ): Promise<{ id: string; status: string }>;
  /** Newest first. Used to reconcile an ambiguous send before retrying (rule 7). */
  listConversationMessages(
    input: {
      conversationId: string;
      accountId: string;
      limit?: number;
    } & CallOptions,
  ): Promise<ProviderMessage[]>;
  /** Replies to one comment (Instagram/Facebook). Used to reconcile an ambiguous comment reply. */
  listCommentReplies(
    input: {
      accountId: string;
      postId: string;
      commentId: string;
      limit?: number;
    } & CallOptions,
  ): Promise<ProviderCommentReply[]>;
  getAccountsHealth(input: { profileId: string }): Promise<AccountHealth[]>;
  /**
   * T57: each connected account's profile picture (`GET /v1/accounts?profileId=`,
   * `SocialAccount.profilePicture`, null when the platform gives none).
   */
  listAccountPictures(input: { profileId: string }): Promise<AccountPicture[]>;
  /**
   * Offboarding (T21): removes an account from Zernio (`DELETE /v1/accounts/{accountId}`; a
   * 1-hour grace period keeps it restorable on Zernio's side). An account already gone (404)
   * counts as done.
   */
  disconnectAccount(input: { accountId: string } & CallOptions): Promise<void>;
  /**
   * Offboarding (T21): deletes the brand's profile (`DELETE /v1/profiles/{profileId}`). Zernio
   * refuses (400) while any account is still connected to it. Already gone (404) is done.
   */
  deleteProfile(input: { profileId: string } & CallOptions): Promise<void>;
  /** Recent posts of an account that have comments (`GET /v1/inbox/comments`), newest first. */
  listCommentedPosts(
    input: {
      accountId: string;
      since: Date;
      limit?: number;
    } & CallOptions,
  ): Promise<{ postId: string }[]>;
  /** A post's top-level comments (`GET /v1/inbox/comments/{postId}`). */
  listPostComments(
    input: {
      accountId: string;
      postId: string;
      limit?: number;
    } & CallOptions,
  ): Promise<ProviderComment[]>;
  /** `GET /v1/usage?range=cycle&groupBy=profile`; null where usage isn't available (mock). */
  getUsageByProfile(input?: CallOptions): Promise<ProviderUsage | null>;
  /** A cheap read (list one profile). Throws like any call; used to see whether a pause ended. */
  ping(): Promise<void>;
}

export interface ProviderErrorInfo {
  title: string | null;
  body: string | null;
  helpUrl: string | null;
  steps: string[];
}

export class SocialProviderError extends Error {
  constructor(
    message: string,
    readonly details: {
      /** HTTP status; undefined for network errors and timeouts. */
      status?: number;
      code?: string;
      /**
       * The request may have taken effect (5xx, timeout, network error).
       * Reconcile before retrying a send.
       */
      ambiguous: boolean;
      retryAfterSeconds?: number;
      /** Private reply (T41): this comment's one DM is spent, by this call or an earlier one. */
      privateReplyConsumed?: boolean;
      /** The provider's own fix for a failed connect (email: `details.title/body/guidance`). */
      info?: ProviderErrorInfo;
    },
  ) {
    super(message);
    this.name = "SocialProviderError";
  }
}
export type { WhatsAppTemplate } from "./whatsapp-templates";
