import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AccountHealth,
  AccountPicture,
  CreatePostInput,
  ProviderComment,
  ProviderCommentReply,
  ProviderMessage,
  ProviderReview,
  ProviderPostStatus,
  PostValidation,
  ProviderUsage,
  SocialPlatform,
  SocialProvider,
  PostingQueue,
  AdAccount,
  SmsOnNumber,
  SmsRegistration,
  VoiceSettings,
  OwnedNumber,
  PhoneCountry,
  PhoneNumberType,
  PurchaseResult,
  CalendarEventSummary,
  EmailDiscovery,
  Integration,
  SiteKeys,
  AdCampaignSummary,
  AdConnection,
  AdLead,
  AdRuleSummary,
  AdLeadStatus,
  Broadcast,
  LeadForm,
  ChatFlow,
  Contact,
  Sequence,
  SequenceStep,
  CommentAutomation,
  CommentAutomationInput,
  WorkflowGraph,
  CommentAutomationLogEntry,
} from "./types";
import { platformLabel, platformOf } from "./platforms";
import { SocialProviderError } from "./types";
import type { WhatsAppTemplate } from "./whatsapp-templates";
import {
  MOCK_BEST_TIMES,
  mockDashboard,
  mockDemographics,
  mockFollowerSeries,
  mockOnlineFollowers,
  mockPosts,
  mockTimeline,
} from "./mock-analytics";

// SOCIAL_PROVIDER_MODE=mock (CLAUDE.md rule 14): a stand-in for Zernio for tests and local smoke
// tests. Nothing leaves the process. Ids are derived from the input, so a retry with the same
// idempotency key gets the same id, like Zernio's replay.
const idFrom = (prefix: string, ...parts: string[]) =>
  `${prefix}_${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24)}`;

export interface MockSend {
  kind: "comment" | "dm" | "private_reply" | "review";
  accountId: string;
  targetId: string;
  idempotencyKey: string;
  providerId: string;
  /** Kept in memory for assertions only; never logged (rule 10). */
  message: string;
}

/** Where mock-mode post images live; served by /api/mock-media/[name] (mock mode only). */
export const MOCK_MEDIA_DIR = join(tmpdir(), "ai-receptionist-mock-media");
const MEDIA_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};

export class MockSocialProvider implements SocialProvider {
  readonly sends: MockSend[] = [];
  readonly posts = new Map<string, CreatePostInput & { status: ProviderPostStatus | "deleted" }>();

  constructor(private readonly appUrl = process.env.APP_URL ?? "http://localhost:3000") {}

  async createProfile(input: { name: string; externalId: string }) {
    return { profileId: idFrom("mock_profile", input.externalId), alreadyExisted: false };
  }

  /** Sends the browser straight back to the app; no account is connected. */
  /** Zernio's dry run, from the registry's rules (the real one checks more). */
  async validatePost(
    input: Omit<CreatePostInput, "publishAt" | "idempotencyKey">,
  ): Promise<PostValidation> {
    const media = input.mediaUrls?.length ?? 0;
    const errors: PostValidation["errors"] = [];
    for (const t of input.targets) {
      const rules = platformOf(t.platform)?.post;
      const name = platformLabel(t.platform);
      if (!rules) errors.push({ platform: t.platform, message: `${name} does not support posts.` });
      else if (rules.mediaRequired && media === 0)
        errors.push({ platform: t.platform, message: `${name} requires media.` });
      else if (input.content.length > rules.textMax)
        errors.push({ platform: t.platform, message: `${name} text is too long.` });
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  async getConnectUrl(input: { platform: SocialPlatform; profileId: string; redirectUrl: string }) {
    const url = new URL(input.redirectUrl);
    url.searchParams.set("mock_connect", "1");
    return { authUrl: url.toString() };
  }

  /** Telegram codes: "connected" on the second check (the owner sent it), else pending. */
  private telegramChecks = new Map<string, number>();
  private telegramCodes = new Map<string, string>();
  /** Accounts the mock connected itself (Telegram), per profile, for listAccountPictures. */
  private profileAccounts = new Map<string, string[]>();

  async startTelegramConnect(input: { profileId: string }) {
    const code = `ZRN-${idFrom("tg", input.profileId, String(Date.now())).slice(-6).toUpperCase()}`;
    this.telegramCodes.set(code, input.profileId);
    return {
      code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      botUsername: "LateScheduleBot",
    };
  }

  async checkTelegramConnect(input: { code: string }) {
    if (input.code === "ZRN-EXPIRED") return { status: "expired" as const };
    const checks = (this.telegramChecks.get(input.code) ?? 0) + 1;
    this.telegramChecks.set(input.code, checks);
    if (checks < 2) return { status: "pending" as const };
    const accountId = idFrom("mock_telegram", input.code);
    const profileId = this.telegramCodes.get(input.code);
    if (profileId) {
      const list = this.profileAccounts.get(profileId) ?? [];
      if (!list.includes(accountId)) this.profileAccounts.set(profileId, [...list, accountId]);
    }
    return { status: "connected" as const, accountId, username: "Harbour Bean Channel" };
  }

  /** "wrong-pass" is refused like Zernio refuses a bad app password (401). */
  async connectBluesky(input: { profileId: string; identifier: string; appPassword: string }) {
    if (input.appPassword === "wrong-pass") {
      throw new SocialProviderError("Zernio connectBluesky failed (401)", {
        status: 401,
        ambiguous: false,
      });
    }
    const username = input.identifier.replace(/^@/, "");
    return {
      account: { accountId: idFrom("mock_bluesky", `${input.profileId}:${username}`), username },
    };
  }

  async createPost(
    input: CreatePostInput,
  ): Promise<{ providerPostId: string; status: ProviderPostStatus; scheduledFor?: string | null }> {
    const providerPostId = idFrom("mock_post", input.idempotencyKey);
    const queued = input.queueProfileId
      ? ((await this.getQueue({ profileId: input.queueProfileId }))?.nextSlots[0] ?? null)
      : null;
    const status: ProviderPostStatus = input.publishAt || queued ? "scheduled" : "publishing";
    if (!this.posts.has(providerPostId)) this.posts.set(providerPostId, { ...input, status });
    return {
      providerPostId,
      status,
      scheduledFor: queued ?? input.publishAt?.toISOString() ?? null,
    };
  }

  /** Sites connected with the owner's keys (T80), per profile. */
  private integrations = new Map<string, Integration[]>();

  async listIntegrations(input: { profileId: string; platforms: readonly string[] }) {
    return (this.integrations.get(input.profileId) ?? []).filter((i) =>
      input.platforms.includes(i.platform),
    );
  }

  async connectSiteWithKeys(input: { profileId: string; keys: SiteKeys }) {
    const k = input.keys;
    const name =
      k.kind === "shopify" ? k.shop : k.kind === "wordpress" ? k.siteUrl : "Your Webflow site";
    const id = idFrom(`mock_${k.kind}`, input.profileId, name);
    const list = (this.integrations.get(input.profileId) ?? []).filter((i) => i.id !== id);
    this.integrations.set(input.profileId, [...list, { id, platform: k.kind, name, active: true }]);
    return { accountId: id, name };
  }

  /** Texting (T82c): every number can text and needs a US registration. */
  private smsRegistrations: (SmsRegistration & { otp: string | null })[] = [];

  async enableSms(input: { numberId: string }): Promise<SmsOnNumber> {
    return {
      enabled: true,
      accountId: idFrom("mock_sms", input.numberId),
      notCapable: false,
      notReady: false,
      needsRegistration: true,
    };
  }

  async listSmsRegistrations(input: { phoneNumber: string }): Promise<SmsRegistration[]> {
    return this.smsRegistrations
      .filter((r) => r.phoneNumbers.includes(input.phoneNumber))
      .map((r) => {
        const { otp, ...rest } = r;
        void otp;
        return rest;
      });
  }

  async startSmsRegistration(input: { body: Record<string, unknown> }) {
    const type = input.body.registrationType as SmsRegistration["type"];
    const id = idFrom("mock_smsreg", String(this.smsRegistrations.length));
    const awaitingOtp = type === "sole_prop_10dlc";
    this.smsRegistrations.push({
      id,
      type,
      status: "pending",
      declineReason: null,
      awaitingOtp,
      phoneNumbers: (input.body.phoneNumbers as string[]) ?? [],
      otp: awaitingOtp ? "123456" : null,
    });
    return { id, status: "pending" as const, awaitingOtp };
  }

  async verifySmsRegistrationCode(input: { id: string; code: string }) {
    const r = this.smsRegistrations.find((x) => x.id === input.id);
    if (!r || r.otp !== input.code) {
      throw new SocialProviderError("mock verifySmsRegistrationOtp failed (400)", {
        status: 400,
        ambiguous: false,
      });
    }
    r.awaitingOtp = false;
  }

  async resendSmsRegistrationCode(input: { id: string }) {
    void input.id;
  }

  private voice = new Map<string, VoiceSettings>();

  async setVoice(input: { numberId: string; settings: Partial<VoiceSettings> }) {
    const current: VoiceSettings = this.voice.get(input.numberId) ?? {
      enabled: true,
      forwardTo: null,
      voicemailGreeting: null,
      businessHoursEnabled: false,
      businessHoursTimezone: null,
      businessHours: [],
    };
    const next = {
      ...current,
      ...input.settings,
      forwardTo:
        input.settings.forwardTo === undefined
          ? current.forwardTo
          : input.settings.forwardTo || null,
    };
    this.voice.set(input.numberId, next);
    return next;
  }

  async getCallRecordingUrl(input: { callId: string }) {
    void input.callId;
    return null;
  }

  /** Phone numbers (T82a): US local and toll-free at $3; a pretend ID country (GB) is left out. */
  private numbers = new Map<string, OwnedNumber[]>();

  async listPhoneCountries(): Promise<PhoneCountry[]> {
    const t = (numberType: PhoneNumberType, needsKyc = false) => ({
      numberType,
      monthlyCents: 300,
      needsKyc,
      callsAvailable: true,
      smsAvailable: true,
      inStock: true,
      instant: true,
    });
    return [
      { code: "US", types: [t("local"), t("toll_free")] },
      { code: "GB", types: [t("local", true)] },
    ];
  }

  async searchPhoneNumbers(input: { numberType: PhoneNumberType; areaCode?: string }) {
    const area = input.numberType === "toll_free" ? "800" : (input.areaCode || "415").slice(0, 3);
    return ["0142", "0177", "0190"].map((end) => ({
      phoneNumber: `+1${area}555${end}`,
      locality: input.numberType === "toll_free" ? null : "San Francisco",
      features: ["voice", "sms"],
    }));
  }

  async purchasePhoneNumber(input: {
    profileId: string;
    country: string;
    numberType: PhoneNumberType;
    phoneNumber: string;
    purchaseIntentId: string;
  }): Promise<PurchaseResult> {
    const id = idFrom("mock_number", input.purchaseIntentId);
    const list = (this.numbers.get(input.profileId) ?? []).filter((n) => n.id !== id);
    this.numbers.set(input.profileId, [
      ...list,
      {
        id,
        phoneNumber: input.phoneNumber,
        country: input.country,
        numberType: input.numberType,
        status: "active",
        monthlyCents: 300,
      },
    ]);
    return { kind: "bought", id, phoneNumber: input.phoneNumber, profileId: input.profileId };
  }

  async listOwnedNumbers(input: { profileId: string }) {
    return this.numbers.get(input.profileId) ?? [];
  }

  async releasePhoneNumber(input: { id: string }) {
    for (const [profile, list] of this.numbers) {
      this.numbers.set(
        profile,
        list.filter((n) => n.id !== input.id),
      );
    }
  }

  /** Calendar (T81d): a supplier delivery at 9 and a staff meeting at 2, every day. */
  private calendarAdds: CalendarEventSummary[] = [];

  async listCalendarEvents(input: { accountId: string; from: string; to: string }) {
    const day = input.from.slice(0, 10);
    const fixed: CalendarEventSummary[] = [
      {
        id: `mock_cal_${day}_1`,
        title: "Supplier delivery",
        start: `${day}T09:00:00+08:00`,
        end: `${day}T09:30:00+08:00`,
        allDay: false,
        busy: true,
      },
      {
        id: `mock_cal_${day}_2`,
        title: "Staff meeting",
        start: `${day}T14:00:00+08:00`,
        end: `${day}T15:00:00+08:00`,
        allDay: false,
        busy: true,
      },
    ];
    void input.accountId;
    return [...fixed, ...this.calendarAdds].filter((e) => e.start < input.to && e.end > input.from);
  }

  async createCalendarEvent(input: {
    accountId: string;
    title: string;
    start: string;
    end: string;
  }) {
    const id = idFrom("mock_cal", input.accountId, input.start, input.title);
    this.calendarAdds.push({
      id,
      title: input.title,
      start: input.start,
      end: input.end,
      allDay: false,
      busy: true,
    });
    return { id };
  }

  async getMailConnectUrl(input: { platform: string; redirectUrl: string }) {
    const url = new URL(input.redirectUrl);
    url.searchParams.set("connected", input.platform);
    return { authUrl: url.toString() };
  }

  async discoverEmail(input: { email: string }): Promise<EmailDiscovery> {
    const domain = input.email.split("@")[1] ?? "";
    if (domain === "gmail.com") {
      return {
        route: "google_oauth",
        providerName: "Gmail",
        passwordLabel: null,
        helpUrl: null,
        steps: [],
        preflight: [],
      };
    }
    if (domain === "proton.me") {
      return {
        route: "unsupported",
        providerName: "Proton Mail",
        passwordLabel: null,
        helpUrl: null,
        steps: [],
        preflight: [],
      };
    }
    return {
      route: "imap",
      providerName: "Zoho Mail",
      passwordLabel: "App password",
      helpUrl: "https://accounts.zoho.com/home#security/app_password",
      steps: ["Open Zoho's security settings.", "Create an app password named Waggle."],
      preflight: [{ text: "Turn on IMAP access in your Zoho Mail settings.", url: null }],
    };
  }

  async connectEmail(input: { profileId: string; email: string; password: string }) {
    if (input.password === "wrong") {
      throw new SocialProviderError("mock connectEmail failed (422)", {
        status: 422,
        code: "imap_auth_failed",
        ambiguous: false,
        info: {
          title: "Couldn't sign in to Zoho Mail",
          body: "Check the password is typed exactly.",
          helpUrl: null,
          steps: [],
        },
      });
    }
    const id = idFrom("mock_imap", input.profileId, input.email);
    const list = (this.integrations.get(input.profileId) ?? []).filter((i) => i.id !== id);
    this.integrations.set(input.profileId, [
      ...list,
      { id, platform: "imap", name: input.email, active: true },
    ]);
  }

  async connectLine(input: { profileId: string; channelId: string }) {
    const id = idFrom("mock_line", input.profileId, input.channelId);
    const list = (this.integrations.get(input.profileId) ?? []).filter((i) => i.id !== id);
    this.integrations.set(input.profileId, [
      ...list,
      { id, platform: "line", name: "Your LINE account", active: true },
    ]);
    return { accountId: id, name: "Your LINE account", webhookReady: true };
  }

  async connectWhatsAppWithKeys(input: { profileId: string; phoneNumberId: string }) {
    return {
      accountId: idFrom("mock_whatsapp", input.profileId, input.phoneNumberId),
      username: "+63 917 555 0100",
    };
  }

  /** Ads (T79): connecting makes one Meta ads connection with one ad account (PHP). */
  private adConnections = new Map<string, AdConnection>();
  private adCampaigns = new Map<string, AdCampaignSummary & { connectionId: string }>();
  private adRules = new Map<string, AdRuleSummary & { connectionId: string }>();

  async connectMetaAds(input: { profileId: string; facebookAccountId: string }) {
    const id = idFrom("mock_metaads", input.profileId);
    this.adConnections.set(input.profileId, {
      id,
      platform: "metaads",
      name: "Meta ads",
      parentAccountId: input.facebookAccountId,
      active: true,
    });
    return { connectionId: id };
  }

  async listAdConnections(input: { profileId: string }): Promise<AdConnection[]> {
    const c = this.adConnections.get(input.profileId);
    return c ? [c] : [];
  }

  async listAdAccounts(input: { connectionId: string }): Promise<AdAccount[]> {
    return [
      {
        id: `act_${input.connectionId.slice(-8)}`,
        name: "Your ad account",
        currency: "PHP",
        minDailyBudget: 50,
        billing: "ok",
        usable: true,
      },
    ];
  }

  async boostPost(input: { body: Record<string, unknown>; idempotencyKey: string }) {
    const id = idFrom("mock_campaign", input.idempotencyKey);
    const budget = input.body.budget as { amount: number; type: "daily" | "lifetime" } | undefined;
    this.adCampaigns.set(id, {
      id,
      connectionId: String(input.body.accountId ?? ""),
      platform: "facebook",
      name: String(input.body.name ?? "Boost"),
      status: "pending_review",
      budget: budget ?? null,
      currency: "PHP",
      spend: 0,
      reach: 0,
      clicks: 0,
    });
    return { id, status: "pending_review" as const };
  }

  async listAdCampaigns(input: { connectionId: string }): Promise<AdCampaignSummary[]> {
    return [...this.adCampaigns.values()]
      .filter((c) => c.connectionId === input.connectionId)
      .map((c) => {
        const { connectionId, ...rest } = c;
        void connectionId;
        return rest;
      });
  }

  async setAdCampaignStatus(input: { campaignId: string; status: "active" | "paused" }) {
    const c = this.adCampaigns.get(input.campaignId);
    if (c) c.status = input.status;
  }

  async listAdRules(input: { connectionId: string }): Promise<AdRuleSummary[]> {
    return [...this.adRules.values()]
      .filter((r) => r.connectionId === input.connectionId)
      .map((r) => {
        const { connectionId, ...rest } = r;
        void connectionId;
        return rest;
      });
  }

  async createAdRule(input: { body: Record<string, unknown> }) {
    const id = idFrom("mock_rule", String(input.body.name), String(this.adRules.size));
    this.adRules.set(id, {
      id,
      connectionId: String(input.body.accountId ?? ""),
      name: String(input.body.name ?? "Rule"),
      adAccountId: String(input.body.adAccountId ?? ""),
      enabled: input.body.enabled === true,
    });
    return { id };
  }

  async setAdRuleEnabled(input: { id: string; enabled: boolean }) {
    const r = this.adRules.get(input.id);
    if (r) r.enabled = input.enabled;
  }

  async deleteAdRule(input: { id: string }) {
    this.adRules.delete(input.id);
  }

  /** Lead forms and their leads (T78c); one demo lead per new form. */
  private leadForms = new Map<string, LeadForm & { accountId: string }>();
  private adLeads = new Map<string, AdLead & { accountId: string }>();

  async listLeadForms(input: { accountId: string }): Promise<LeadForm[]> {
    return [...this.leadForms.values()]
      .filter((f) => f.accountId === input.accountId)
      .map((f) => ({ id: f.id, name: f.name, status: f.status }));
  }

  async createLeadForm(input: { body: Record<string, unknown> }) {
    const accountId = String(input.body.accountId ?? "");
    const name = String(input.body.name ?? "Lead form");
    const id = idFrom("mock_form", accountId, name, String(this.leadForms.size));
    this.leadForms.set(id, { id, name, status: "active", accountId });
    const leadId = idFrom("mock_lead", id);
    this.adLeads.set(leadId, {
      id: leadId,
      accountId,
      formName: name,
      createdAt: new Date().toISOString(),
      fields: {
        full_name: "Maria Santos",
        email: "maria@example.com",
        phone_number: "+639175550142",
      },
      consents: [{ checkboxKey: "waggle_messages", isChecked: true }],
      status: "new",
      contactId: null,
    });
    return { id };
  }

  async listAdLeads(input: { accountIds: string[]; status?: AdLeadStatus }): Promise<AdLead[]> {
    return [...this.adLeads.values()]
      .filter(
        (l) =>
          input.accountIds.includes(l.accountId) && (!input.status || l.status === input.status),
      )
      .map((l) => {
        const { accountId, ...rest } = l;
        void accountId;
        return rest;
      });
  }

  async updateAdLeadStatus(input: { id: string; status: AdLeadStatus }) {
    const l = this.adLeads.get(input.id);
    if (l) l.status = input.status;
  }

  /** Broadcasts (T78b), kept in memory per profile. */
  private broadcasts = new Map<string, Broadcast & { profileId: string; tag: string | null }>();

  async listBroadcasts(input: { profileId: string }): Promise<Broadcast[]> {
    return [...this.broadcasts.values()]
      .filter((b) => b.profileId === input.profileId)
      .reverse()
      .map((b) => {
        const { profileId, tag, ...rest } = b;
        void profileId;
        void tag;
        return rest;
      });
  }

  async createWhatsAppBroadcast(input: {
    profileId: string;
    name: string;
    template: { name: string };
    tag: string | null;
  }) {
    const id = idFrom("mock_bc", input.profileId, input.name, String(this.broadcasts.size));
    const recipients = [...this.contacts.values()].filter(
      (c) =>
        c.profileId === input.profileId &&
        c.subscribed &&
        (!input.tag || c.tags.includes(input.tag)),
    ).length;
    this.broadcasts.set(id, {
      id,
      profileId: input.profileId,
      tag: input.tag,
      name: input.name,
      platform: "whatsapp",
      status: "draft",
      preview: input.template.name,
      scheduledAt: null,
      completedAt: null,
      recipients,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
    });
    return { id, recipients };
  }

  async startBroadcast(input: { id: string; at: string | null }) {
    const b = this.broadcasts.get(input.id);
    if (!b) return;
    if (input.at) Object.assign(b, { status: "scheduled", scheduledAt: input.at });
    else
      Object.assign(b, {
        status: "completed",
        completedAt: new Date().toISOString(),
        sent: b.recipients,
        delivered: b.recipients,
      });
  }

  async cancelBroadcast(input: { id: string }) {
    const b = this.broadcasts.get(input.id);
    if (b) b.status = "cancelled";
  }

  /** Contacts (T78a), kept in memory per profile. */
  private contacts = new Map<string, Contact & { profileId: string }>();

  async listContacts(input: { profileId: string; search?: string; tag?: string; skip?: number }) {
    const all = [...this.contacts.values()]
      .filter((c) => c.profileId === input.profileId)
      .filter((c) => !input.tag || c.tags.includes(input.tag))
      .filter((c) => !input.search || c.name.toLowerCase().includes(input.search.toLowerCase()))
      .reverse();
    const page = all.slice(input.skip ?? 0, (input.skip ?? 0) + 50).map((c) => {
      const { profileId, ...rest } = c;
      void profileId;
      return rest;
    });
    return { contacts: page, total: all.length };
  }

  async createContact(input: {
    profileId: string;
    name: string;
    email?: string;
    tags: string[];
    subscribed: boolean;
    channel?: { accountId: string; platform: string; identifier: string };
  }) {
    const id = idFrom("mock_contact", input.profileId, input.name, String(this.contacts.size));
    this.contacts.set(id, {
      id,
      profileId: input.profileId,
      name: input.name,
      email: input.email ?? null,
      tags: input.tags,
      subscribed: input.subscribed,
      platform: input.channel?.platform ?? null,
      identifier: input.channel?.identifier ?? null,
      lastMessageAt: null,
    });
    return { id };
  }

  async importContacts(input: {
    profileId: string;
    accountId?: string;
    rows: { name: string; identifier?: string; email?: string; tags: string[] }[];
  }) {
    for (const r of input.rows) {
      await this.createContact({
        profileId: input.profileId,
        name: r.name,
        email: r.email,
        tags: r.tags,
        subscribed: false,
        ...(input.accountId && r.identifier
          ? {
              channel: {
                accountId: input.accountId,
                platform: "whatsapp",
                identifier: r.identifier,
              },
            }
          : {}),
      });
    }
    return { created: input.rows.length, skipped: 0, errors: 0 };
  }

  async updateContact(input: { id: string; tags?: string[]; subscribed?: boolean }) {
    const c = this.contacts.get(input.id);
    if (!c) return;
    if (input.tags) c.tags = input.tags;
    if (input.subscribed !== undefined) c.subscribed = input.subscribed;
  }

  /** Sequences (T77c), kept in memory per profile. */
  private sequences = new Map<string, Sequence & { profileId: string }>();

  async listSequences(input: { profileId: string }): Promise<Sequence[]> {
    return [...this.sequences.values()]
      .filter((s) => s.profileId === input.profileId)
      .map((s) => {
        const { profileId, ...rest } = s;
        void profileId;
        return rest;
      });
  }

  async createSequence(input: {
    profileId: string;
    accountId: string;
    platform: string;
    name: string;
    steps: SequenceStep[];
  }) {
    const id = idFrom("mock_seq", input.profileId, input.name, String(this.sequences.size));
    this.sequences.set(id, {
      id,
      profileId: input.profileId,
      name: input.name,
      platform: input.platform,
      accountId: input.accountId,
      status: "draft",
      steps: input.steps.length,
      preview: input.steps[0]?.message?.text ?? input.steps[0]?.template?.name ?? "",
      enrolled: 0,
      completed: 0,
      exited: 0,
    });
    return { id };
  }

  async setSequenceActive(input: { id: string; active: boolean }) {
    const s = this.sequences.get(input.id);
    if (s) s.status = input.active ? "active" : "paused";
  }

  async deleteSequence(input: { id: string }) {
    this.sequences.delete(input.id);
  }

  async enrollInSequence(input: { id: string; contactIds: string[] }) {
    const s = this.sequences.get(input.id);
    if (s) s.enrolled += input.contactIds.length;
    return { enrolled: input.contactIds.length, failed: 0 };
  }

  /** The demo has no contacts yet (T78): three for any tag. */
  async listContactIdsByTag(input: { tag: string }) {
    return [1, 2, 3].map((n) => idFrom("mock_contact", input.tag, String(n)));
  }

  /** Chat flows (T77b), kept in memory per profile. */
  private flows = new Map<string, ChatFlow & { profileId: string; graph: WorkflowGraph }>();

  async listWorkflows(input: { profileId: string }): Promise<ChatFlow[]> {
    return [...this.flows.values()]
      .filter((f) => f.profileId === input.profileId)
      .map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        platform: f.platform,
        status: f.status,
        started: f.started,
        completed: f.completed,
      }));
  }

  async createWorkflow(input: {
    profileId: string;
    accountId: string;
    platform: string;
    name: string;
    description?: string;
    graph: WorkflowGraph;
  }) {
    const id = idFrom("mock_wf", input.profileId, input.name, String(this.flows.size));
    this.flows.set(id, {
      id,
      profileId: input.profileId,
      name: input.name,
      description: input.description ?? "",
      platform: input.platform,
      status: "draft",
      started: 0,
      completed: 0,
      graph: input.graph,
    });
    return { id };
  }

  async setWorkflowActive(input: { id: string; active: boolean }) {
    const f = this.flows.get(input.id);
    if (f) f.status = input.active ? "active" : "paused";
  }

  async deleteWorkflow(input: { id: string }) {
    this.flows.delete(input.id);
  }

  /** Comment-to-DM automations (T77a), kept in memory per profile. */
  private automations = new Map<string, CommentAutomation & { profileId: string }>();

  async listCommentAutomations(input: { profileId: string }) {
    return [...this.automations.values()]
      .filter((a) => a.profileId === input.profileId)
      .map((a): CommentAutomation => {
        const { profileId, ...rest } = a;
        void profileId;
        return rest;
      });
  }

  async createCommentAutomation(input: {
    profileId: string;
    automation: CommentAutomationInput;
    isActive: boolean;
  }) {
    const id = idFrom(
      "mock_ca",
      input.profileId,
      input.automation.name,
      String(this.automations.size),
    );
    this.automations.set(id, {
      id,
      profileId: input.profileId,
      platform: "instagram",
      postTitle: null,
      dmMessage: input.automation.dmMessage ?? null,
      button: input.automation.button ?? null,
      commentReply: input.automation.commentReply ?? null,
      name: input.automation.name,
      accountId: input.automation.accountId,
      keywords: input.automation.keywords,
      matchMode: input.automation.matchMode,
      once: input.automation.once,
      isActive: input.isActive,
      stats: { triggered: 0, dmsSent: 0, dmsFailed: 0, linkClicks: 0 },
    });
    return { id };
  }

  async updateCommentAutomation(input: {
    id: string;
    automation?: CommentAutomationInput;
    isActive?: boolean;
  }) {
    const a = this.automations.get(input.id);
    if (!a)
      throw new SocialProviderError("Zernio updateCommentAutomation failed (404)", {
        status: 404,
        ambiguous: false,
      });
    if (input.automation) {
      Object.assign(a, {
        ...input.automation,
        dmMessage: input.automation.dmMessage ?? null,
        button: input.automation.button ?? null,
        commentReply: input.automation.commentReply ?? null,
      });
    }
    if (input.isActive !== undefined) a.isActive = input.isActive;
  }

  async deleteCommentAutomation(input: { id: string }) {
    this.automations.delete(input.id);
  }

  /** No comments reach the mock, so nothing has been answered yet. */
  async listCommentAutomationLogs(): Promise<{
    entries: CommentAutomationLogEntry[];
    misses: number;
  }> {
    return { entries: [], misses: 0 };
  }

  /** Posting times per profile (T75); the mock works out the next slots in UTC. */
  private queues = new Map<
    string,
    { timezone: string; slots: { dayOfWeek: number; time: string }[] }
  >();

  async getQueue(input: { profileId: string }): Promise<PostingQueue | null> {
    const q = this.queues.get(input.profileId);
    return q ? { ...q, nextSlots: mockNextSlots(q.slots, new Date()) } : null;
  }

  async saveQueue(input: {
    profileId: string;
    timezone: string;
    slots: { dayOfWeek: number; time: string }[];
  }): Promise<PostingQueue> {
    this.queues.set(input.profileId, { timezone: input.timezone, slots: input.slots });
    return {
      timezone: input.timezone,
      slots: input.slots,
      nextSlots: mockNextSlots(input.slots, new Date()),
    };
  }

  /** Templates per WhatsApp account; two approved ones to start with (local demos). */
  private waTemplates = new Map<string, WhatsAppTemplate[]>();

  async listWhatsAppTemplates(input: { accountId: string }) {
    if (!this.waTemplates.has(input.accountId)) {
      this.waTemplates.set(input.accountId, [
        {
          id: idFrom("wat", input.accountId, "follow_up"),
          name: "follow_up",
          language: "en",
          status: "APPROVED",
          category: "UTILITY",
          body: "Hi {{1}}, thanks for your message! We're open again today. Reply here and we'll help you right away.",
          variables: 1,
        },
        {
          id: idFrom("wat", input.accountId, "weekend_promo"),
          name: "weekend_promo",
          language: "en",
          status: "PENDING",
          category: "MARKETING",
          body: "This weekend only: 2-for-1 pastries before 10 AM.",
          variables: 0,
        },
      ]);
    }
    return this.waTemplates.get(input.accountId)!;
  }

  async createWhatsAppTemplate(input: {
    accountId: string;
    name: string;
    category: "UTILITY" | "MARKETING";
    language: string;
    body: string;
    examples: string[];
  }) {
    const list = await this.listWhatsAppTemplates(input);
    if (list.some((t) => t.name === input.name && t.language === input.language)) {
      throw new SocialProviderError("Zernio createWhatsAppTemplate failed (400)", {
        status: 400,
        ambiguous: false,
      });
    }
    const id = idFrom("wat", input.accountId, input.name);
    list.push({
      id,
      name: input.name,
      language: input.language,
      status: "PENDING",
      category: input.category,
      body: input.body,
      variables: input.examples.length,
    });
    return { id, status: "PENDING" };
  }

  /** Four boards for every Pinterest account (local demos). */
  async listPinterestBoards(input: { accountId: string }) {
    return ["Coffee menu", "Cakes and pastries", "Our café", "Events"].map((name) => ({
      id: idFrom("board", input.accountId, name),
      name,
    }));
  }

  /** The browser PUTs to our own mock route, which stores the file like uploadMedia does. */
  async presignMedia(input: { filename: string; contentType: string; size: number }) {
    const ext = MEDIA_EXT[input.contentType] ?? "bin";
    const hash = idFrom("m", input.filename, String(input.size), String(Date.now())).slice(2);
    const name = `${hash}.${ext}`;
    const url = `${this.appUrl}/api/mock-media/${name}`;
    return { uploadUrl: url, publicUrl: url };
  }

  async uploadMedia(input: { filename: string; contentType: string; bytes: Uint8Array }) {
    const ext = MEDIA_EXT[input.contentType] ?? "bin";
    const name = `${createHash("sha256").update(input.bytes).digest("hex").slice(0, 24)}.${ext}`;
    await mkdir(MOCK_MEDIA_DIR, { recursive: true });
    await writeFile(join(MOCK_MEDIA_DIR, name), input.bytes);
    return { publicUrl: `${this.appUrl}/api/mock-media/${name}` };
  }

  /** Steady demo numbers for Google Business Profile (T76). */
  async getGoogleBusinessPerformance(input: {
    accountId: string;
    fromDate: string;
    toDate: string;
  }) {
    const days = Math.max(
      1,
      Math.round((Date.parse(input.toDate) - Date.parse(input.fromDate)) / 86_400_000),
    );
    return {
      BUSINESS_IMPRESSIONS_MOBILE_MAPS: 14 * days,
      BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 9 * days,
      BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 4 * days,
      CALL_CLICKS: Math.round(days / 2),
      BUSINESS_DIRECTION_REQUESTS: days,
      WEBSITE_CLICKS: Math.round(days * 0.7),
    };
  }

  async deletePost(input: { postId: string }) {
    const post = this.posts.get(input.postId);
    if (post) post.status = "deleted";
  }

  /** Records which platforms a post was removed from (T75c). */
  readonly unpublished: { postId: string; platform: string; accountId?: string }[] = [];

  async unpublishPost(input: { postId: string; platform: string; accountId?: string }) {
    this.unpublished.push({
      postId: input.postId,
      platform: input.platform,
      accountId: input.accountId,
    });
  }

  async replyToComment(input: {
    accountId: string;
    postId: string;
    commentId: string;
    message: string;
    idempotencyKey: string;
  }) {
    const providerReplyId = this.record("comment", input.accountId, input.commentId, input);
    return { providerReplyId };
  }

  /** Comment ids currently hidden (T40), keyed `accountId|commentId`. */
  readonly hidden = new Set<string>();

  async hideComment(input: { accountId: string; postId: string; commentId: string }) {
    this.hidden.add(`${input.accountId}|${input.commentId}`);
  }

  async unhideComment(input: { accountId: string; postId: string; commentId: string }) {
    this.hidden.delete(`${input.accountId}|${input.commentId}`);
  }

  /** Like Meta: one private reply per comment; a second is refused as consumed. */
  async sendPrivateReply(input: {
    accountId: string;
    postId: string;
    commentId: string;
    message: string;
  }) {
    const done = this.sends.find(
      (x) =>
        x.kind === "private_reply" &&
        x.accountId === input.accountId &&
        x.targetId === input.commentId,
    );
    if (done) {
      throw new SocialProviderError("Zernio sendPrivateReply failed (400)", {
        status: 400,
        code: "PRIVATE_REPLY_CONSUMED",
        ambiguous: false,
        privateReplyConsumed: true,
      });
    }
    const providerMessageId = this.record("private_reply", input.accountId, input.commentId, {
      ...input,
      idempotencyKey: `private:${input.commentId}`,
    });
    return { providerMessageId };
  }

  /** Reviews a test put on a Page (keyed by Zernio account id), newest first. */
  // Analytics (T48): steady sample numbers; `analyticsCalls` lets tests count the reads.
  analyticsCalls = 0;
  async getAnalyticsDashboard(input: {
    profileId: string;
    fromDate: string;
    toDate: string;
    platform?: SocialPlatform;
  }) {
    this.analyticsCalls++;
    return mockDashboard(input);
  }
  async listPostAnalytics(input: {
    profileId: string;
    fromDate: string;
    toDate: string;
    page: number;
  }) {
    this.analyticsCalls++;
    const all = mockPosts(input.profileId, input.fromDate, input.toDate);
    const pages = Math.max(1, Math.ceil(all.length / 50));
    return { posts: all.slice((input.page - 1) * 50, input.page * 50), pages };
  }
  async getFollowerStats(input: { profileId: string; fromDate: string; toDate: string }) {
    this.analyticsCalls++;
    return mockFollowerSeries(input.fromDate, input.toDate);
  }
  async getBestTimeToPost() {
    this.analyticsCalls++;
    return MOCK_BEST_TIMES;
  }
  async getDemographics(input: { accountId: string; platform: SocialPlatform }) {
    this.analyticsCalls++;
    return mockDemographics(input.platform);
  }
  async getOnlineFollowers() {
    this.analyticsCalls++;
    return mockOnlineFollowers();
  }
  async getPostTimeline(input: { postId: string }) {
    this.analyticsCalls++;
    return mockTimeline(input.postId);
  }

  readonly reviews = new Map<string, ProviderReview[]>();

  async listReviews(input: { accountId: string }): Promise<ProviderReview[]> {
    const replied = new Set(this.sends.filter((x) => x.kind === "review").map((x) => x.targetId));
    return (this.reviews.get(input.accountId) ?? []).map((r) => ({
      ...r,
      hasReply: r.hasReply || replied.has(r.id),
    }));
  }

  async replyToReview(input: {
    accountId: string;
    reviewId: string;
    message: string;
    idempotencyKey: string;
  }) {
    const providerReplyId = this.record("review", input.accountId, input.reviewId, input);
    return { providerReplyId };
  }

  async sendDm(input: {
    accountId: string;
    conversationId: string;
    message: string;
    idempotencyKey: string;
  }) {
    const providerMessageId = this.record("dm", input.accountId, input.conversationId, input);
    return { providerMessageId };
  }

  async listConversationMessages(input: {
    conversationId: string;
    accountId: string;
  }): Promise<ProviderMessage[]> {
    return this.sends
      .filter((s) => s.kind === "dm" && s.targetId === input.conversationId)
      .reverse()
      .map((s) => ({
        id: s.providerId,
        direction: "outgoing",
        text: s.message,
        createdAt: new Date().toISOString(),
      }));
  }

  async listCommentReplies(input: {
    accountId: string;
    postId: string;
    commentId: string;
  }): Promise<ProviderCommentReply[]> {
    return this.sends
      .filter((s) => s.kind === "comment" && s.targetId === input.commentId)
      .map((s) => ({ id: s.providerId, text: s.message, fromOwner: true, createdAt: null }));
  }

  /** Offboarding (T21): what was removed, and ids whose removal should fail once (tests). */
  readonly disconnectedAccounts: string[] = [];
  readonly deletedProfiles: string[] = [];
  readonly failRemoval = new Set<string>();

  async disconnectAccount(input: { accountId: string }): Promise<void> {
    this.failIfAsked(input.accountId, "disconnectAccount");
    this.disconnectedAccounts.push(input.accountId);
  }

  async deleteProfile(input: { profileId: string }): Promise<void> {
    this.failIfAsked(input.profileId, "deleteProfile");
    this.deletedProfiles.push(input.profileId);
  }

  private failIfAsked(id: string, operation: string): void {
    if (!this.failRemoval.delete(id)) return;
    throw new SocialProviderError(`${operation}: mock failure`, { status: 503, ambiguous: true });
  }

  async ping(): Promise<void> {}

  /** No Zernio account behind the mock: usage isn't available. */
  async getUsageByProfile(): Promise<ProviderUsage | null> {
    return null;
  }

  async listCommentedPosts(): Promise<{ postId: string }[]> {
    return [];
  }

  async listPostComments(): Promise<ProviderComment[]> {
    return [];
  }

  async getAccountsHealth(): Promise<AccountHealth[]> {
    return [];
  }

  /** No pictures in mock mode: brands show initials. */
  async listAccountPictures(input: { profileId: string }): Promise<AccountPicture[]> {
    return (this.profileAccounts.get(input.profileId) ?? []).map((accountId) => ({
      accountId,
      pictureUrl: null,
    }));
  }

  private record(
    kind: MockSend["kind"],
    accountId: string,
    targetId: string,
    input: { message: string; idempotencyKey: string },
  ): string {
    const existing = this.sends.find((s) => s.idempotencyKey === input.idempotencyKey);
    if (existing) return existing.providerId;
    const providerId = idFrom(`mock_${kind}`, input.idempotencyKey);
    this.sends.push({ kind, accountId, targetId, providerId, ...input });
    console.info(`[mock social] ${kind} send ${providerId} (key ${input.idempotencyKey})`);
    return providerId;
  }
}

export type SocialProviderMode = "zernio" | "mock";

/**
 * `SOCIAL_PROVIDER_MODE` wins; otherwise mock under Vitest, Zernio everywhere else. Mock is
 * refused on a Vercel production deployment, where it would silently drop replies.
 */
export function resolveSocialProviderMode(
  env: Record<string, string | undefined>,
): SocialProviderMode {
  const raw = env.SOCIAL_PROVIDER_MODE?.trim().toLowerCase();
  if (raw && raw !== "mock" && raw !== "zernio") {
    throw new Error(`SOCIAL_PROVIDER_MODE must be "mock" or "zernio", got "${raw}"`);
  }
  const mode: SocialProviderMode = (raw as SocialProviderMode) || (env.VITEST ? "mock" : "zernio");
  if (mode === "mock" && env.VERCEL_ENV === "production") {
    throw new Error("SOCIAL_PROVIDER_MODE=mock is not allowed in production");
  }
  return mode;
}

/** The next 5 slot times after `now` (UTC), for the mock queue. */
export function mockNextSlots(slots: { dayOfWeek: number; time: string }[], now: Date): string[] {
  const out: string[] = [];
  const sorted = [...slots].sort((a, b) => a.time.localeCompare(b.time));
  for (let d = 0; d < 14 && out.length < 5; d++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
    for (const s of sorted) {
      if (s.dayOfWeek !== day.getUTCDay() || out.length >= 5) continue;
      const [h, m] = s.time.split(":").map(Number);
      const at = new Date(day.getTime() + (h * 60 + m) * 60_000);
      if (at > now) out.push(at.toISOString());
    }
  }
  return out;
}
