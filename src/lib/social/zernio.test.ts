import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDmAccessMissing, SocialProviderError } from "./types";
import {
  createZernioProvider,
  isPlatformPaused,
  parseRetryAfter,
  pickTikTokPrivacy,
  type ZernioSocialProvider,
} from "./zernio";

// The real @zernio/node SDK runs; only fetch is replaced, so no call reaches Zernio.
interface Captured {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

let captured: Captured[];
let respond: (req: Captured) => Response;
let provider: ZernioSocialProvider;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

beforeEach(() => {
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      // Like real fetch: an aborted signal rejects before anything is sent.
      if (request.signal.aborted) throw request.signal.reason;
      const text = await request.text();
      const req: Captured = {
        method: request.method,
        url: new URL(request.url),
        headers: request.headers,
        body: text ? JSON.parse(text) : undefined,
      };
      captured.push(req);
      return respond(req);
    }),
  );
  provider = createZernioProvider({ apiKey: "sk_test_zernio" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ZernioSocialProvider", () => {
  it("createProfile sends name + externalId with an idempotency key", async () => {
    respond = () => json({ message: "ok", profile: { _id: "prof_1", name: "Demo" } }, 201);

    await expect(
      provider.createProfile({ name: "Demo", externalId: "tenant-1", idempotencyKey: "key-1" }),
    ).resolves.toEqual({ profileId: "prof_1", alreadyExisted: false });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.href).toBe("https://zernio.com/api/v1/profiles");
    expect(req.headers.get("Authorization")).toBe("Bearer sk_test_zernio");
    expect(req.headers.get("Idempotency-Key")).toBe("key-1");
    expect(req.body).toEqual({ name: "Demo", externalId: "tenant-1" });
  });

  it("createProfile returns the existing profile on an externalId conflict", async () => {
    respond = () =>
      json(
        {
          error: "Profile with this externalId already exists",
          code: "profile_external_id_conflict",
          details: { existingProfileId: "prof_existing" },
        },
        409,
      );
    await expect(provider.createProfile({ name: "Demo", externalId: "tenant-1" })).resolves.toEqual(
      {
        profileId: "prof_existing",
        alreadyExisted: true,
      },
    );
  });

  it("createProfile does not adopt a profile that only shares the name", async () => {
    respond = () =>
      json({ error: "name taken", details: { existingProfileId: "prof_other" } }, 409);
    await expect(
      provider.createProfile({ name: "Demo", externalId: "tenant-1" }),
    ).rejects.toMatchObject({
      details: { status: 409, ambiguous: false },
    });
  });

  it("getConnectUrl passes profileId and redirect_url", async () => {
    respond = () => json({ authUrl: "https://www.instagram.com/oauth/authorize?x=1", state: "s" });

    await expect(
      provider.getConnectUrl({
        platform: "instagram",
        profileId: "prof_1",
        redirectUrl: "https://app.test/settings",
      }),
    ).resolves.toEqual({ authUrl: "https://www.instagram.com/oauth/authorize?x=1" });

    const [req] = captured;
    expect(req.method).toBe("GET");
    expect(req.url.pathname).toBe("/api/v1/connect/instagram");
    expect(req.url.searchParams.get("profileId")).toBe("prof_1");
    expect(req.url.searchParams.get("redirect_url")).toBe("https://app.test/settings");
    // Whitelabel (T68): Waggle's welcome screen, never Zernio's name.
    expect(req.url.searchParams.get("welcome")).toBe("true");
    expect(req.url.searchParams.get("brandName")).toBe("Waggle");
    expect(req.url.searchParams.get("primaryColor")).toBe("#F6B21B");
  });

  it("connectBluesky sends the app password with state {userId}-{profileId}", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/users"
        ? json({ currentUserId: "user_9", users: [] })
        : json({ message: "ok", account: { _id: "acc_bs", username: "cafe.bsky.social" } });

    await expect(
      provider.connectBluesky({
        profileId: "prof_1",
        identifier: "cafe.bsky.social",
        appPassword: "abcd-efgh-ijkl-mnop",
      }),
    ).resolves.toEqual({ account: { accountId: "acc_bs", username: "cafe.bsky.social" } });

    const [users, connect] = captured;
    expect(users.url.pathname).toBe("/api/v1/users");
    expect(connect.method).toBe("POST");
    expect(connect.url.pathname).toBe("/api/v1/connect/bluesky/credentials");
    expect(connect.body).toEqual({
      identifier: "cafe.bsky.social",
      appPassword: "abcd-efgh-ijkl-mnop",
      state: "user_9-prof_1",
    });

    // The user id is looked up once.
    await provider.connectBluesky({ profileId: "prof_2", identifier: "x", appPassword: "y" });
    expect(captured.filter((r) => r.url.pathname === "/api/v1/users")).toHaveLength(1);
  });

  it("listReviews asks for Google reviews and keeps their stars (T61)", async () => {
    respond = () =>
      json({
        data: [
          {
            id: "accounts/1/locations/2/reviews/3",
            rating: 2,
            text: "Slow",
            created: "2026-11-12T01:00:00Z",
          },
        ],
      });
    const [review] = await provider.listReviews({ accountId: "acc_g", platform: "googlebusiness" });
    expect(captured[0].url.searchParams.get("platform")).toBe("googlebusiness");
    expect(review).toMatchObject({ id: "accounts/1/locations/2/reviews/3", rating: 2 });
  });

  it("Telegram: a code for the bot, then its status", async () => {
    respond = (req) =>
      req.method === "GET"
        ? json({
            code: "ZRN-ABC123",
            expiresAt: "2026-11-12T10:15:00Z",
            expiresIn: 900,
            botUsername: "LateScheduleBot",
          })
        : json({
            status: "connected",
            chatTitle: "Harbour Bean",
            account: { _id: "acc_tg", platform: "telegram", username: "harbourbean" },
          });
    await expect(provider.startTelegramConnect({ profileId: "prof_1" })).resolves.toEqual({
      code: "ZRN-ABC123",
      expiresAt: "2026-11-12T10:15:00Z",
      botUsername: "LateScheduleBot",
    });
    expect(captured[0].url.pathname).toBe("/api/v1/connect/telegram");
    expect(captured[0].url.searchParams.get("profileId")).toBe("prof_1");

    await expect(provider.checkTelegramConnect({ code: "ZRN-ABC123" })).resolves.toEqual({
      status: "connected",
      accountId: "acc_tg",
      username: "harbourbean",
    });
    expect(captured[1].method).toBe("PATCH");
    expect(captured[1].url.searchParams.get("code")).toBe("ZRN-ABC123");
  });

  it("presignMedia asks for an upload link with the file's size (T63)", async () => {
    respond = () =>
      json({
        uploadUrl: "https://bucket.r2.cloudflarestorage.com/temp/1_video.mp4?X-Amz-Signature=x",
        publicUrl: "https://media.zernio.com/temp/1_video.mp4",
        key: "temp/1_video.mp4",
        expiresIn: 3600,
      });
    await expect(
      provider.presignMedia({ filename: "video.mp4", contentType: "video/mp4", size: 48_000_000 }),
    ).resolves.toEqual({
      uploadUrl: "https://bucket.r2.cloudflarestorage.com/temp/1_video.mp4?X-Amz-Signature=x",
      publicUrl: "https://media.zernio.com/temp/1_video.mp4",
    });
    expect(captured[0].url.pathname).toBe("/api/v1/media/presign");
    expect(captured[0].body).toEqual({
      filename: "video.mp4",
      contentType: "video/mp4",
      size: 48_000_000,
    });
  });

  it("createPost sends YouTube's title and asks TikTok for its video options (T63)", async () => {
    respond = (req) =>
      req.url.pathname.includes("tiktok")
        ? json({ privacyLevels: [{ value: "PUBLIC_TO_EVERYONE" }] })
        : json({ post: { _id: "post_v", status: "scheduled" } }, 201);
    await provider.createPost({
      content: "Ube cheesecake is back",
      mediaUrls: ["https://media.zernio.com/temp/1_video.mp4"],
      targets: [
        { platform: "youtube", accountId: "acc_yt" },
        { platform: "tiktok", accountId: "acc_tt" },
      ],
      publishAt: new Date("2026-11-20T09:00:00Z"),
      idempotencyKey: "k-video",
      tiktokConsent: true,
      youtubeTitle: "Ube cheesecake is back",
    });
    const creator = captured.find((r) => r.url.pathname.includes("tiktok"))!;
    expect(creator.url.searchParams.get("mediaType")).toBe("video");
    const post = captured.find((r) => r.url.pathname === "/api/v1/posts")!;
    expect((post.body as { platforms: unknown[] }).platforms).toContainEqual({
      platform: "youtube",
      accountId: "acc_yt",
      platformSpecificData: { title: "Ube cheesecake is back" },
    });
  });

  it("listPinterestBoards reads the account's boards (T64)", async () => {
    respond = () =>
      json({ boards: [{ id: "b1", name: "Coffee menu" }, { id: "b2", name: " " }, { name: "x" }] });
    await expect(provider.listPinterestBoards({ accountId: "acc_p" })).resolves.toEqual([
      { id: "b1", name: "Coffee menu" },
      { id: "b2", name: "Untitled board" },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/accounts/acc_p/pinterest-boards");
  });

  it("createPost into the queue sends queuedFromProfile, no time, and reads back Zernio's time (T75)", async () => {
    respond = () =>
      json(
        { post: { _id: "post_q", status: "scheduled", scheduledFor: "2026-11-17T01:00:00.000Z" } },
        201,
      );
    await expect(
      provider.createPost({
        content: "Ube is back",
        targets: [{ platform: "instagram", accountId: "acc_ig" }],
        publishAt: null,
        idempotencyKey: "k-q",
        queueProfileId: "prof_1",
      }),
    ).resolves.toEqual({
      providerPostId: "post_q",
      status: "scheduled",
      scheduledFor: "2026-11-17T01:00:00.000Z",
    });
    const body = captured[0].body as Record<string, unknown>;
    expect(body.queuedFromProfile).toBe("prof_1");
    expect(body).not.toHaveProperty("publishNow");
    expect(body).not.toHaveProperty("scheduledFor");
  });

  it("createPost sends each platform's own text and options (T75)", async () => {
    respond = () => json({ post: { _id: "post_o", status: "published" } }, 201);
    await provider.createPost({
      content: "Shared",
      targets: [
        { platform: "instagram", accountId: "acc_ig" },
        { platform: "linkedin", accountId: "acc_li" },
      ],
      publishAt: null,
      idempotencyKey: "k-o",
      extras: {
        instagram: { platformSpecificData: { contentType: "story" } },
        linkedin: { customContent: "Longer text", platformSpecificData: { firstComment: "x" } },
      },
    });
    expect((captured[0].body as { platforms: unknown[] }).platforms).toEqual([
      {
        platform: "instagram",
        accountId: "acc_ig",
        platformSpecificData: { contentType: "story" },
      },
      {
        platform: "linkedin",
        accountId: "acc_li",
        customContent: "Longer text",
        platformSpecificData: { firstComment: "x" },
      },
    ]);
  });

  it("createWhatsAppBroadcast targets subscribed people with the tag, then fills from them (T78b)", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/broadcasts"
        ? json({ success: true, broadcast: { id: "bc_1" } })
        : json({ success: true, added: 42, skipped: 0 });
    await expect(
      provider.createWhatsAppBroadcast({
        profileId: "prof_1",
        accountId: "acc_wa",
        name: "Promo",
        template: { name: "weekend_promo", language: "en", nameVariable: true },
        tag: "regular",
      }),
    ).resolves.toEqual({ id: "bc_1", recipients: 42 });
    expect(captured[0].body).toMatchObject({
      platform: "whatsapp",
      template: {
        name: "weekend_promo",
        language: "en",
        variableMapping: { "1": { field: "name" } },
      },
      segmentFilters: { isSubscribed: true, tags: ["regular"] },
    });
    expect(captured[1].url.pathname).toBe("/api/v1/broadcasts/bc_1/recipients");
    expect(captured[1].body).toEqual({ useSegment: true });
    await provider.startBroadcast({ id: "bc_1", at: "2026-11-15T00:00:00.000Z" });
    expect(captured[2].url.pathname).toBe("/api/v1/broadcasts/bc_1/schedule");
  });

  it("own keys (T80): Shopify, WordPress and Webflow return the account; WhatsApp too", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/connect/whatsapp/credentials"
        ? json({
            account: { accountId: "acc_wa", username: "harbourbean", phoneNumber: "+639175550100" },
          })
        : json({
            account: {
              _id: "acc_site",
              platform: "shopify",
              username: "hb",
              displayName: "Harbour Bean",
            },
          });
    await expect(
      provider.connectSiteWithKeys({
        profileId: "prof_1",
        keys: { kind: "shopify", shop: "hb.myshopify.com", accessToken: "shpat_x" },
      }),
    ).resolves.toEqual({ accountId: "acc_site", name: "Harbour Bean" });
    expect(captured[0].url.pathname).toBe("/api/v1/connect/shopify/token");
    expect(captured[0].body).toEqual({
      profileId: "prof_1",
      shop: "hb.myshopify.com",
      accessToken: "shpat_x",
    });

    await provider.connectSiteWithKeys({
      profileId: "prof_1",
      keys: {
        kind: "wordpress",
        siteUrl: "https://hb.ph",
        username: "m",
        applicationPassword: "a b",
      },
    });
    expect(captured[1].url.pathname).toBe("/api/v1/connect/wordpress/token");
    await provider.connectSiteWithKeys({
      profileId: "prof_1",
      keys: { kind: "webflow", siteToken: "t" },
    });
    expect(captured[2].url.pathname).toBe("/api/v1/connect/webflow/token");

    await expect(
      provider.connectWhatsAppWithKeys({
        profileId: "prof_1",
        accessToken: "EAAG",
        wabaId: "1",
        phoneNumberId: "2",
      }),
    ).resolves.toEqual({ accountId: "acc_wa", username: "harbourbean" });
    expect(captured[3].body).toEqual({
      profileId: "prof_1",
      accessToken: "EAAG",
      wabaId: "1",
      phoneNumberId: "2",
    });
  });

  it("texting (T82c): only the registrations naming this number; enable returns the texting account", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/sms/registrations"
        ? json({
            registrations: [
              {
                id: "r_mine",
                registrationType: "standard_10dlc",
                status: "pending",
                awaitingOtp: false,
                phoneNumbers: ["+14155550142"],
              },
              {
                id: "r_other",
                registrationType: "sole_prop_10dlc",
                status: "approved",
                awaitingOtp: false,
                phoneNumbers: ["+12125550000"],
              },
            ],
          })
        : json({
            enabled: true,
            id: "acc_sms",
            smsCapable: true,
            needsRegistration: true,
            notReady: false,
          });
    await expect(provider.listSmsRegistrations({ phoneNumber: "+14155550142" })).resolves.toEqual([
      {
        id: "r_mine",
        type: "standard_10dlc",
        status: "pending",
        declineReason: null,
        awaitingOtp: false,
        phoneNumbers: ["+14155550142"],
      },
    ]);
    await expect(provider.enableSms({ numberId: "num_1" })).resolves.toEqual({
      enabled: true,
      accountId: "acc_sms",
      notCapable: false,
      notReady: false,
      needsRegistration: true,
    });
    expect(captured[1].url.pathname).toBe("/api/v1/phone-numbers/num_1/sms");
  });

  it("phone numbers (T82a): buy never connects WhatsApp; ID and payment answers carry no link", async () => {
    let answer: unknown = {
      message: "ok",
      phoneNumber: {
        id: "num_1",
        phoneNumber: "+14155550142",
        status: "active",
        profileId: "prof_1",
      },
    };
    respond = () => json(answer);
    const buy = () =>
      provider.purchasePhoneNumber({
        profileId: "prof_1",
        country: "US",
        numberType: "local",
        phoneNumber: "+14155550142",
        wantsSms: true,
        purchaseIntentId: "intent-1",
      });
    await expect(buy()).resolves.toEqual({
      kind: "bought",
      id: "num_1",
      phoneNumber: "+14155550142",
      profileId: "prof_1",
    });
    expect(captured[0].body).toMatchObject({
      connectWhatsapp: false,
      purchaseIntentId: "intent-1",
    });
    answer = {
      status: "already_purchased",
      numberId: "num_1",
      phoneNumber: "+14155550142",
      profileId: "prof_1",
    };
    await expect(buy()).resolves.toMatchObject({ kind: "bought", id: "num_1" });
    answer = { status: "kyc_required", country: "GB", kycUrl: "https://example.test/kyc/x" };
    await expect(buy()).resolves.toEqual({ kind: "needs_id" });
    answer = { message: "pay", checkoutUrl: "https://example.test/checkout" };
    await expect(buy()).resolves.toEqual({ kind: "needs_payment" });
  });

  it("calendar (T81d): events without cancelled ones; adding a booking", async () => {
    respond = (req) =>
      req.method === "GET"
        ? json({
            data: [
              {
                id: "e1",
                title: "Supplier",
                start: "2026-11-14T09:00:00+08:00",
                end: "2026-11-14T09:30:00+08:00",
                allDay: false,
              },
              {
                id: "e2",
                title: "Gone",
                start: "2026-11-14T10:00:00+08:00",
                end: "2026-11-14T11:00:00+08:00",
                allDay: false,
                status: "cancelled",
              },
              {
                id: "e3",
                title: "Free",
                start: "2026-11-14T12:00:00+08:00",
                end: "2026-11-14T13:00:00+08:00",
                allDay: false,
                busy: false,
              },
            ],
            pagination: { hasMore: false, nextCursor: null },
          })
        : json({ data: { id: "e9" } }, 201);
    await expect(
      provider.listCalendarEvents({
        accountId: "acc_g",
        from: "2026-11-14T00:00:00Z",
        to: "2026-11-15T00:00:00Z",
      }),
    ).resolves.toEqual([
      {
        id: "e1",
        title: "Supplier",
        start: "2026-11-14T09:00:00+08:00",
        end: "2026-11-14T09:30:00+08:00",
        allDay: false,
        busy: true,
      },
      {
        id: "e3",
        title: "Free",
        start: "2026-11-14T12:00:00+08:00",
        end: "2026-11-14T13:00:00+08:00",
        allDay: false,
        busy: false,
      },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/calendar/events");
    expect(captured[0].url.searchParams.get("accountId")).toBe("acc_g");
    await expect(
      provider.createCalendarEvent({
        accountId: "acc_g",
        title: "Maria: booking",
        start: "2026-11-21T09:00:00+08:00",
        end: "2026-11-21T10:00:00+08:00",
      }),
    ).resolves.toEqual({ id: "e9" });
    expect(captured[1].body).toMatchObject({ accountId: "acc_g", title: "Maria: booking" });
  });

  it("Gmail sign-in (T81c) asks for the email and calendar areas, with no welcome screen", async () => {
    respond = () =>
      json({ authUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1", state: "s" });
    await expect(
      provider.getMailConnectUrl({
        platform: "google",
        profileId: "prof_1",
        redirectUrl: "https://app.test/settings",
        scopes: ["email", "calendar"],
      }),
    ).resolves.toEqual({ authUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
    expect(captured[0].url.pathname).toBe("/api/v1/connect/google");
    expect(captured[0].url.searchParams.get("scopes")).toBe("email,calendar");
    expect(captured[0].url.searchParams.get("welcome")).toBeNull();
  });

  it("email and LINE (T80b): discovery, a failed sign-in with the provider's fix, LINE's state", async () => {
    respond = (req) => {
      const p = req.url.pathname;
      if (p === "/api/v1/email/imap/discover")
        return json({
          data: {
            route: "imap",
            provider: { id: "zoho", name: "Zoho Mail" },
            auth: {
              kind: "app_password",
              label: "App password",
              helpUrl: "https://z.example",
              steps: ["a"],
            },
            preflight: [{ id: "enable_imap", text: "Turn on IMAP.", url: null }],
          },
        });
      if (p === "/api/v1/email/imap/accounts")
        return json(
          {
            code: "imap_auth_failed",
            details: {
              title: "Couldn't sign in to Zoho Mail",
              body: "Check the password.",
              guidance: { helpUrl: "https://z.example/app", steps: ["s1"] },
            },
          },
          422,
        );
      if (p === "/api/v1/users") return json({ currentUserId: "user_1", users: [] });
      return json({
        account: { accountId: "acc_line", username: "@hb", displayName: "Harbour Bean" },
        webhook: { configured: true, testSucceeded: true },
      });
    };
    await expect(provider.discoverEmail({ email: "ana@zoho.com" })).resolves.toEqual({
      route: "imap",
      providerName: "Zoho Mail",
      passwordLabel: "App password",
      helpUrl: "https://z.example",
      steps: ["a"],
      preflight: [{ text: "Turn on IMAP.", url: null }],
    });
    expect(captured[0].headers.get("Authorization")).toBe("Bearer sk_test_zernio");

    await expect(
      provider.connectEmail({ profileId: "prof_1", email: "ana@zoho.com", password: "x" }),
    ).rejects.toMatchObject({
      details: {
        status: 422,
        code: "imap_auth_failed",
        info: {
          title: "Couldn't sign in to Zoho Mail",
          helpUrl: "https://z.example/app",
          steps: ["s1"],
        },
      },
    });

    await expect(
      provider.connectLine({ profileId: "prof_1", channelId: "2001234567", channelSecret: "s" }),
    ).resolves.toEqual({ accountId: "acc_line", name: "Harbour Bean", webhookReady: true });
    expect(captured.at(-1)!.body).toEqual({
      channelId: "2001234567",
      channelSecret: "s",
      state: "user_1-prof_1",
    });
  });

  it("ads (T79): connect, boost with its key, campaigns with results, pause", async () => {
    respond = (req) => {
      const p = req.url.pathname;
      if (p === "/api/v1/connect/facebook/ads")
        return json({ alreadyConnected: true, accountId: "c_meta" });
      if (p === "/api/v1/ads/boost")
        return json({ ad: { _id: "ad_1", status: "pending_review" }, message: "ok" }, 201);
      if (p === "/api/v1/ads/campaigns")
        return json({
          campaigns: [
            {
              platformCampaignId: "cmp_1",
              platform: "facebook",
              campaignName: "Boost: Ube",
              status: "active",
              budget: { amount: 300, type: "daily" },
              currency: "PHP",
              metrics: { spend: 612, reach: 9800, clicks: 214 },
            },
            { nope: true },
          ],
        });
      return json({ status: "paused", updated: 1, skipped: 0 });
    };
    await expect(
      provider.connectMetaAds({
        profileId: "prof_1",
        facebookAccountId: "acc_fb",
        redirectUrl: "https://app.test/x",
      }),
    ).resolves.toEqual({ connectionId: "c_meta" });
    expect(captured[0].url.searchParams.get("loginMode")).toBe("classic");
    expect(captured[0].url.searchParams.get("accountId")).toBe("acc_fb");

    await expect(
      provider.boostPost({
        body: { postId: "zp_1", accountId: "c_meta" },
        idempotencyKey: "boost-key",
      }),
    ).resolves.toEqual({ id: "ad_1", status: "pending_review" });
    expect(captured[1].headers.get("Idempotency-Key")).toBe("boost-key");

    await expect(provider.listAdCampaigns({ connectionId: "c_meta" })).resolves.toEqual([
      {
        id: "cmp_1",
        platform: "facebook",
        name: "Boost: Ube",
        status: "active",
        budget: { amount: 300, type: "daily" },
        currency: "PHP",
        spend: 612,
        reach: 9800,
        clicks: 214,
      },
    ]);
    expect(captured[2].url.searchParams.get("accountId")).toBe("c_meta");

    await provider.setAdCampaignStatus({
      campaignId: "cmp_1",
      platform: "facebook",
      status: "paused",
    });
    expect(captured[3].url.pathname).toBe("/api/v1/ads/campaigns/cmp_1/status");
    expect(captured[3].body).toEqual({ status: "paused", platform: "facebook" });
  });

  it("listAdLeads reads Meta leads for the Pages; createLeadForm returns the form id (T78c)", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/ads/leads"
        ? json({
            success: true,
            leads: [
              {
                id: "lead_1",
                formName: "Catering",
                createdTime: "2026-11-13T02:00:00.000Z",
                fields: { full_name: "Ana Cruz", email: "ana@example.com" },
                consents: [{ checkboxKey: "waggle_messages", isChecked: true }],
                status: "weird",
              },
              { nope: true },
            ],
          })
        : json({ success: true, form: { id: "form_1" } });
    const leads = await provider.listAdLeads({ accountIds: ["acc_fb", "acc_fb2"] });
    expect(captured[0].url.searchParams.get("accountIds")).toBe("acc_fb,acc_fb2");
    expect(captured[0].url.searchParams.get("platform")).toBe("meta");
    expect(leads).toEqual([
      {
        id: "lead_1",
        formName: "Catering",
        createdAt: "2026-11-13T02:00:00.000Z",
        fields: { full_name: "Ana Cruz", email: "ana@example.com" },
        consents: [{ checkboxKey: "waggle_messages", isChecked: true }],
        status: "new",
        contactId: null,
      },
    ]);
    await expect(
      provider.createLeadForm({ body: { accountId: "acc_fb", name: "Catering" } }),
    ).resolves.toEqual({
      id: "form_1",
    });
    expect(captured[1].url.pathname).toBe("/api/v1/ads/lead-forms");
  });

  it("createContact puts a WhatsApp number on the contact; importContacts sends rows (T78a)", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/contacts"
        ? json({ success: true, contact: { id: "c_1" } })
        : json({ success: true, created: 2, skipped: 1, errors: ["bad row"] });
    await expect(
      provider.createContact({
        profileId: "prof_1",
        name: "Ana",
        tags: ["regular"],
        subscribed: true,
        channel: { accountId: "acc_wa", platform: "whatsapp", identifier: "+639175550142" },
      }),
    ).resolves.toEqual({ id: "c_1" });
    expect(captured[0].body).toEqual({
      profileId: "prof_1",
      name: "Ana",
      tags: ["regular"],
      isSubscribed: true,
      accountId: "acc_wa",
      platform: "whatsapp",
      platformIdentifier: "+639175550142",
      displayIdentifier: "+639175550142",
    });
    await expect(
      provider.importContacts({
        profileId: "prof_1",
        accountId: "acc_wa",
        rows: [{ name: "Jun", identifier: "+639185550199", tags: [] }],
      }),
    ).resolves.toEqual({ created: 2, skipped: 1, errors: 1 });
    expect(captured[1].url.pathname).toBe("/api/v1/contacts/bulk");
  });

  it("createSequence sends the steps; enrollInSequence adds contacts (T77c)", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/sequences"
        ? json({ success: true, sequence: { id: "seq_1" } })
        : json({ success: true, enrolled: 2, failed: 1 });
    const steps = [{ order: 1, delayMinutes: 0, message: { text: "Hi" } }];
    await expect(
      provider.createSequence({
        profileId: "prof_1",
        accountId: "acc_wa",
        platform: "whatsapp",
        name: "Welcome",
        steps,
        exitOnReply: true,
        exitOnUnsubscribe: true,
      }),
    ).resolves.toEqual({ id: "seq_1" });
    expect(captured[0].body).toMatchObject({ platform: "whatsapp", steps, exitOnReply: true });
    await expect(
      provider.enrollInSequence({ id: "seq_1", contactIds: ["c1", "c2", "c3"] }),
    ).resolves.toEqual({ enrolled: 2, failed: 1 });
    expect(captured[1].url.pathname).toBe("/api/v1/sequences/seq_1/enroll");
    expect(captured[1].body).toEqual({ contactIds: ["c1", "c2", "c3"] });
  });

  it("createWorkflow sends the graph, setWorkflowActive activates or pauses (T77b)", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/workflows"
        ? json({ success: true, workflow: { id: "wf_1", status: "draft" } }, 201)
        : json({ success: true });
    const graph = {
      nodes: [
        { id: "trigger", type: "trigger", config: { triggerType: "inbound_message" } },
        { id: "end", type: "end" },
      ],
      edges: [{ id: "e0", source: "trigger", target: "end" }],
      entryNodeId: "trigger",
    };
    await expect(
      provider.createWorkflow({
        profileId: "prof_1",
        accountId: "acc_wa",
        platform: "whatsapp",
        name: "Book",
        graph,
      }),
    ).resolves.toEqual({ id: "wf_1" });
    expect(captured[0].body).toEqual({
      profileId: "prof_1",
      accountId: "acc_wa",
      platform: "whatsapp",
      name: "Book",
      nodes: graph.nodes,
      edges: graph.edges,
      entryNodeId: "trigger",
    });
    await provider.setWorkflowActive({ id: "wf_1", active: true });
    expect(captured[1].url.pathname).toBe("/api/v1/workflows/wf_1/activate");
    await provider.setWorkflowActive({ id: "wf_1", active: false });
    expect(captured[2].url.pathname).toBe("/api/v1/workflows/wf_1/pause");
  });

  it("createCommentAutomation sends the DM, button, reply and once-per-person (T77a)", async () => {
    respond = () => json({ success: true, automation: { id: "ca_1" } }, 201);
    await expect(
      provider.createCommentAutomation({
        profileId: "prof_1",
        isActive: true,
        automation: {
          name: "MENU",
          accountId: "acc_ig",
          keywords: ["MENU"],
          matchMode: "word",
          dmMessage: "Hi {{first_name}}",
          button: { title: "Menu", url: "https://a.b/menu" },
          commentReply: "Sent!",
          once: true,
        },
      }),
    ).resolves.toEqual({ id: "ca_1" });
    expect(captured[0].url.pathname).toBe("/api/v1/comment-automations");
    expect(captured[0].body).toEqual({
      profileId: "prof_1",
      accountId: "acc_ig",
      trigger: "comment",
      isActive: true,
      name: "MENU",
      keywords: ["MENU"],
      matchMode: "word",
      dmMessage: "Hi {{first_name}}",
      buttons: [{ type: "url", title: "Menu", url: "https://a.b/menu" }],
      commentReply: "Sent!",
      repeatPolicy: { mode: "once" },
    });
  });

  it("listCommentAutomations reads each automation and its numbers (T77a)", async () => {
    respond = () =>
      json({
        automations: [
          {
            id: "ca_1",
            name: "MENU",
            platform: "instagram",
            accountId: "acc_ig",
            keywords: ["MENU"],
            dmMessage: "Hi",
            buttons: [{ type: "url", title: "Menu", url: "https://a.b" }],
            repeatPolicy: { mode: "every_comment", cooldownHours: 24 },
            isActive: true,
            stats: { triggered: 5, dmsSent: 4, dmsFailed: 1 },
          },
          { bad: true },
        ],
      });
    const [a, ...rest] = await provider.listCommentAutomations({ profileId: "prof_1" });
    expect(rest).toEqual([]);
    expect(a).toMatchObject({
      id: "ca_1",
      button: { title: "Menu", url: "https://a.b" },
      once: false,
      matchMode: "contains",
      stats: { triggered: 5, dmsSent: 4, dmsFailed: 1, linkClicks: 0 },
    });
  });

  it("getGoogleBusinessPerformance returns each metric's total (T76)", async () => {
    respond = () =>
      json({
        success: true,
        metrics: {
          CALL_CLICKS: { total: 14, values: [] },
          WEBSITE_CLICKS: { total: 22 },
          BUSINESS_BOOKINGS: {},
        },
      });
    await expect(
      provider.getGoogleBusinessPerformance({
        accountId: "acc_g",
        fromDate: "2026-10-14",
        toDate: "2026-11-13",
      }),
    ).resolves.toEqual({ CALL_CLICKS: 14, WEBSITE_CLICKS: 22, BUSINESS_BOOKINGS: 0 });
    expect(captured[0].url.pathname).toBe("/api/v1/analytics/googlebusiness/performance");
    expect(captured[0].url.searchParams.get("accountId")).toBe("acc_g");
  });

  it("getQueue reads the default queue; none yet is null (T75)", async () => {
    respond = () =>
      json({
        exists: true,
        schedule: { timezone: "Asia/Manila", slots: [{ dayOfWeek: 1, time: "09:00" }, { bad: 1 }] },
        nextSlots: ["2026-11-17T01:00:00Z"],
      });
    await expect(provider.getQueue({ profileId: "prof_1" })).resolves.toEqual({
      timezone: "Asia/Manila",
      slots: [{ dayOfWeek: 1, time: "09:00" }],
      nextSlots: ["2026-11-17T01:00:00Z"],
    });
    expect(captured[0].url.pathname).toBe("/api/v1/queue/slots");
    expect(captured[0].url.searchParams.get("profileId")).toBe("prof_1");

    respond = () => json({ exists: false });
    await expect(provider.getQueue({ profileId: "prof_2" })).resolves.toBeNull();
  });

  it("saveQueue creates the queue the first time, then updates it (T75)", async () => {
    let n = 0;
    respond = (req) => {
      n += 1;
      if (req.method === "GET")
        return json(
          n === 1 ? { exists: false } : { exists: true, schedule: { timezone: "UTC", slots: [] } },
        );
      return json({
        schedule: { timezone: "Asia/Manila", slots: [{ dayOfWeek: 2, time: "18:00" }] },
        nextSlots: [],
      });
    };
    await provider.saveQueue({
      profileId: "prof_1",
      timezone: "Asia/Manila",
      slots: [{ dayOfWeek: 2, time: "18:00" }],
    });
    expect(captured[1].method).toBe("POST");
    expect(captured[1].body).toMatchObject({
      profileId: "prof_1",
      name: "Posting times",
      timezone: "Asia/Manila",
    });
    await provider.saveQueue({ profileId: "prof_1", timezone: "Asia/Manila", slots: [] });
    expect(captured[3].method).toBe("PUT");
  });

  it("createPost pins to the chosen board (T64)", async () => {
    respond = () => json({ post: { _id: "post_p", status: "scheduled" } }, 201);
    await provider.createPost({
      content: "New cakes",
      mediaUrls: ["https://media.zernio.com/temp/1_photo.jpg"],
      targets: [{ platform: "pinterest", accountId: "acc_p" }],
      publishAt: new Date("2026-11-20T09:00:00Z"),
      idempotencyKey: "k-pin",
      pinterestBoardId: "b1",
    });
    expect((captured[0].body as { platforms: unknown[] }).platforms).toEqual([
      { platform: "pinterest", accountId: "acc_p", platformSpecificData: { boardId: "b1" } },
    ]);
  });

  it("WhatsApp: lists templates with their body and placeholders (T67)", async () => {
    respond = () =>
      json({
        success: true,
        templates: [
          {
            id: "t1",
            name: "follow_up",
            status: "APPROVED",
            category: "UTILITY",
            language: "en",
            components: [{ type: "BODY", text: "Hi {{1}}, thanks!" }],
          },
          { name: "no_id" },
        ],
      });
    await expect(provider.listWhatsAppTemplates({ accountId: "acc_wa" })).resolves.toEqual([
      {
        id: "t1",
        name: "follow_up",
        language: "en",
        status: "APPROVED",
        category: "UTILITY",
        body: "Hi {{1}}, thanks!",
        variables: 1,
      },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/whatsapp/templates");
    expect(captured[0].url.searchParams.get("accountId")).toBe("acc_wa");
  });

  it("WhatsApp: a new template goes to Meta with an example per placeholder (T67)", async () => {
    respond = () => json({ success: true, template: { id: "t2", status: "PENDING" } });
    await expect(
      provider.createWhatsAppTemplate({
        accountId: "acc_wa",
        name: "order_ready",
        category: "UTILITY",
        language: "en",
        body: "Hi {{1}}, your order is ready.",
        examples: ["Ana"],
      }),
    ).resolves.toEqual({ id: "t2", status: "PENDING" });
    expect(captured[0].body).toEqual({
      accountId: "acc_wa",
      name: "order_ready",
      category: "UTILITY",
      language: "en",
      components: [
        {
          type: "body",
          text: "Hi {{1}}, your order is ready.",
          example: { body_text: [["Ana"]] },
        },
      ],
    });
  });

  it("WhatsApp: sendDm with a template sends Meta's template shape, not text (T67)", async () => {
    respond = () => json({ success: true, data: { messageId: "wamid.1", conversationId: "c1" } });
    await provider.sendDm({
      accountId: "acc_wa",
      conversationId: "c1",
      message: "Hi Ana, thanks!",
      idempotencyKey: "k-wa",
      template: { name: "follow_up", language: "en", params: ["Ana"] },
    });
    expect(captured[0].body).toEqual({
      accountId: "acc_wa",
      template: {
        elements: [
          {
            name: "follow_up",
            language: "en",
            components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }] }],
          },
        ],
      },
    });
  });

  it("connectBluesky reports a refused app password as a 401", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/users"
        ? json({ currentUserId: "user_9" })
        : json({ error: "Invalid identifier or password" }, 401);
    await expect(
      provider.connectBluesky({ profileId: "prof_1", identifier: "a", appPassword: "b" }),
    ).rejects.toMatchObject({ details: { status: 401, ambiguous: false } });
  });

  it("createPost schedules with scheduledFor, mediaItems and Idempotency-Key", async () => {
    respond = () => json({ post: { _id: "post_1", status: "scheduled" } }, 201);

    await expect(
      provider.createPost({
        content: "Fresh pastries today",
        mediaUrls: ["https://media.test/a.jpg"],
        targets: [{ platform: "instagram", accountId: "acc_1" }],
        publishAt: new Date("2026-11-01T09:00:00Z"),
        idempotencyKey: "post-key",
      }),
    ).resolves.toMatchObject({ providerPostId: "post_1", status: "scheduled" });

    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/posts");
    expect(req.headers.get("Idempotency-Key")).toBe("post-key");
    expect(req.body).toEqual({
      content: "Fresh pastries today",
      mediaItems: [{ url: "https://media.test/a.jpg" }],
      platforms: [{ platform: "instagram", accountId: "acc_1" }],
      scheduledFor: "2026-11-01T09:00:00.000Z",
    });
  });

  it("createPost with publishAt null publishes now", async () => {
    respond = () => json({ post: { _id: "post_2", status: "published" } }, 201);
    await provider.createPost({
      content: "Now",
      targets: [{ platform: "facebook", accountId: "acc_2" }],
      publishAt: null,
      idempotencyKey: "k",
    });
    expect(captured[0].body).toMatchObject({ publishNow: true });
    expect(captured[0].body).not.toHaveProperty("scheduledFor");
  });

  it("replyToComment posts to the post's comments with commentId and Idempotency-Key", async () => {
    respond = () => json({ success: true, data: { commentId: "reply_1", isReply: true } });

    await expect(
      provider.replyToComment({
        accountId: "acc_1",
        postId: "17890000000000000",
        commentId: "c_1",
        message: "Thanks! We open at 8.",
        idempotencyKey: "draft-key",
      }),
    ).resolves.toEqual({ providerReplyId: "reply_1" });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/17890000000000000");
    expect(req.headers.get("Idempotency-Key")).toBe("draft-key");
    expect(req.body).toEqual({
      accountId: "acc_1",
      commentId: "c_1",
      message: "Thanks! We open at 8.",
    });
  });

  it("hideComment posts to the comment's hide path with accountId (T40)", async () => {
    respond = () => json({ status: "ok", commentId: "c_1", hidden: true, platform: "instagram" });

    await provider.hideComment({ accountId: "acc_1", postId: "p_1", commentId: "c_1" });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/p_1/c_1/hide");
    expect(req.body).toEqual({ accountId: "acc_1" });
  });

  it("unhideComment deletes the hide with accountId in the query (T40)", async () => {
    respond = () => json({ status: "ok", commentId: "c_1", hidden: false, platform: "instagram" });

    await provider.unhideComment({ accountId: "acc_1", postId: "p_1", commentId: "c_1" });

    const [req] = captured;
    expect(req.method).toBe("DELETE");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/p_1/c_1/hide");
    expect(req.url.searchParams.get("accountId")).toBe("acc_1");
  });

  it("hideComment on a comment that's gone is a 400 with the platform code, not ambiguous", async () => {
    respond = () =>
      json({ error: "Comment not found", type: "platform_error", code: "PLATFORM_API_ERROR" }, 400);

    const error = await provider
      .hideComment({ accountId: "acc_1", postId: "p_1", commentId: "c_1" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocialProviderError);
    expect((error as SocialProviderError).details).toMatchObject({
      status: 400,
      code: "PLATFORM_API_ERROR",
      ambiguous: false,
    });
  });

  it("sendPrivateReply posts the message to the comment's private-reply path (T41)", async () => {
    respond = () =>
      json({ status: "sent", messageId: "m_9", commentId: "c_1", platform: "instagram" });

    await expect(
      provider.sendPrivateReply({
        accountId: "acc_1",
        postId: "p_1",
        commentId: "c_1",
        message: "Hi Maria! 3 dozen is ₱540.",
      }),
    ).resolves.toEqual({ providerMessageId: "m_9" });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/p_1/c_1/private-reply");
    expect(req.body).toEqual({ accountId: "acc_1", message: "Hi Maria! 3 dozen is ₱540." });
  });

  it("a spent private reply is a 400 flagged privateReplyConsumed (never retried)", async () => {
    respond = () =>
      json(
        {
          error: "This comment already received a private reply",
          code: "PLATFORM_API_ERROR",
          details: { privateReplyConsumed: true },
        },
        400,
      );

    const error = await provider
      .sendPrivateReply({ accountId: "acc_1", postId: "p_1", commentId: "c_1", message: "Hi" })
      .catch((e: unknown) => e);
    expect((error as SocialProviderError).details).toMatchObject({
      status: 400,
      ambiguous: false,
      privateReplyConsumed: true,
    });
  });

  it("a 502 with an unknown private reply outcome is ambiguous: reconcile before anything else", async () => {
    respond = () => json({ error: "Meta error", details: { privateReplyOutcome: "unknown" } }, 502);

    const error = await provider
      .sendPrivateReply({ accountId: "acc_1", postId: "p_1", commentId: "c_1", message: "Hi" })
      .catch((e: unknown) => e);
    expect((error as SocialProviderError).details).toMatchObject({ status: 502, ambiguous: true });
    expect((error as SocialProviderError).details.privateReplyConsumed).toBeUndefined();
  });

  it("listReviews reads the Page's Facebook reviews and maps recommendations (T42)", async () => {
    respond = () =>
      json({
        status: "ok",
        data: [
          {
            id: "rev_1",
            platform: "facebook",
            reviewer: { id: null, name: "Lara V" },
            rating: 0,
            recommendationType: "negative",
            text: "Waited 40 minutes.",
            created: "2026-11-05T10:12:00Z",
            hasReply: false,
            reviewUrl: "https://www.facebook.com/r/1",
          },
          {
            id: "rev_2",
            reviewer: { name: "Ben" },
            recommendationType: "positive",
            text: "Great!",
            created: "2026-11-05T09:40:00Z",
            hasReply: true,
            reviewUrl: null,
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });

    await expect(provider.listReviews({ accountId: "acc_1" })).resolves.toEqual([
      {
        id: "rev_1",
        reviewerName: "Lara V",
        recommends: false,
        text: "Waited 40 minutes.",
        rating: null,
        createdAt: "2026-11-05T10:12:00Z",
        hasReply: false,
        reviewUrl: "https://www.facebook.com/r/1",
      },
      {
        id: "rev_2",
        reviewerName: "Ben",
        recommends: true,
        text: "Great!",
        rating: null,
        createdAt: "2026-11-05T09:40:00Z",
        hasReply: true,
        reviewUrl: null,
      },
    ]);
    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/reviews");
    expect(req.url.searchParams.get("platform")).toBe("facebook");
    expect(req.url.searchParams.get("accountId")).toBe("acc_1");
  });

  it("replyToReview posts the reply with accountId and Idempotency-Key (T42)", async () => {
    respond = () =>
      json({
        status: "ok",
        reply: { id: "reply_9", text: "Sorry", created: "2026-11-05T10:20:00Z" },
        platform: "facebook",
      });

    await expect(
      provider.replyToReview({
        accountId: "acc_1",
        reviewId: "rev_1",
        message: "Sorry, Lara.",
        idempotencyKey: "draft-key",
      }),
    ).resolves.toEqual({ providerReplyId: "reply_9" });
    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/reviews/rev_1/reply");
    expect(req.headers.get("Idempotency-Key")).toBe("draft-key");
    expect(req.body).toEqual({ accountId: "acc_1", message: "Sorry, Lara." });
  });

  it("sendDm posts to the conversation with Idempotency-Key", async () => {
    respond = () => json({ success: true, data: { messageId: "m_1", conversationId: "conv_1" } });

    await expect(
      provider.sendDm({
        accountId: "acc_1",
        conversationId: "conv_1",
        message: "Hi!",
        idempotencyKey: "dm-key",
      }),
    ).resolves.toEqual({ providerMessageId: "m_1" });

    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/conversations/conv_1/messages");
    expect(req.headers.get("Idempotency-Key")).toBe("dm-key");
    expect(req.body).toEqual({ accountId: "acc_1", message: "Hi!" });
  });

  it("listConversationMessages reads newest first", async () => {
    respond = () =>
      json({
        messages: [
          { id: "m_2", direction: "outgoing", message: "Hi!", createdAt: "2026-10-28T10:01:00Z" },
          { id: "m_1", direction: "incoming", message: null, createdAt: "2026-10-28T10:00:00Z" },
        ],
      });

    await expect(
      provider.listConversationMessages({ conversationId: "conv_1", accountId: "acc_1" }),
    ).resolves.toEqual([
      {
        id: "m_2",
        direction: "outgoing",
        text: "Hi!",
        createdAt: "2026-10-28T10:01:00Z",
        senderName: null,
      },
      {
        id: "m_1",
        direction: "incoming",
        text: null,
        createdAt: "2026-10-28T10:00:00Z",
        senderName: null,
      },
    ]);
    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/conversations/conv_1/messages");
    expect(Object.fromEntries(req.url.searchParams)).toEqual({
      accountId: "acc_1",
      limit: "20",
      sortOrder: "desc",
    });
  });

  it("listCommentReplies reads one comment's replies and marks our own", async () => {
    respond = () =>
      json({
        status: "success",
        comment: { id: "c_1", message: "Open Sunday?" },
        comments: [
          {
            id: "r_1",
            message: "Yes, 8am to 10pm.",
            createdTime: "2026-10-28T10:01:00Z",
            from: { id: "me", isOwner: true },
          },
          { id: "r_2", message: "same q", from: { id: "x", isOwner: false } },
        ],
      });

    await expect(
      provider.listCommentReplies({ accountId: "acc_1", postId: "1789", commentId: "c_1" }),
    ).resolves.toEqual([
      { id: "r_1", text: "Yes, 8am to 10pm.", fromOwner: true, createdAt: "2026-10-28T10:01:00Z" },
      { id: "r_2", text: "same q", fromOwner: false, createdAt: null },
    ]);
    const [req] = captured;
    expect(req.method).toBe("GET");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/1789");
    expect(Object.fromEntries(req.url.searchParams)).toEqual({
      accountId: "acc_1",
      commentId: "c_1",
      limit: "50",
    });
  });

  it("a send aborts when the caller's signal fires (ambiguous)", async () => {
    respond = () => json({ success: true, data: { messageId: "m_1" } });
    const controller = new AbortController();
    controller.abort();
    const error = (await provider
      .sendDm({
        accountId: "acc_1",
        conversationId: "conv_1",
        message: "Hi!",
        idempotencyKey: "dm-key",
        signal: controller.signal,
      })
      .catch((e: unknown) => e)) as SocialProviderError;
    expect(error).toBeInstanceOf(SocialProviderError);
    expect(error.details.ambiguous).toBe(true);
    expect(captured).toHaveLength(0);
  });

  it("listCommentedPosts asks for posts with comments since a time (T16)", async () => {
    respond = () =>
      json({ data: [{ id: "1789", commentCount: 3 }], pagination: { hasMore: false } });
    await expect(
      provider.listCommentedPosts({ accountId: "acc_1", since: new Date("2026-10-28T10:00:00Z") }),
    ).resolves.toEqual([{ postId: "1789" }]);
    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/comments");
    expect(Object.fromEntries(req.url.searchParams)).toEqual({
      accountId: "acc_1",
      since: "2026-10-28T10:00:00.000Z",
      limit: "20",
      minComments: "1",
      sortBy: "date",
      sortOrder: "desc",
    });
  });

  it("listPostComments maps a post's comments (T16)", async () => {
    respond = () =>
      json({
        comments: [
          {
            id: "c_1",
            message: "Open Sunday?",
            createdTime: "2026-10-28T10:01:00Z",
            from: { username: "mika.r", isOwner: false },
          },
          { id: "c_2", message: "Yes!", from: { name: "Cafe", isOwner: true } },
        ],
      });
    await expect(
      provider.listPostComments({ accountId: "acc_1", postId: "1789" }),
    ).resolves.toEqual([
      {
        id: "c_1",
        text: "Open Sunday?",
        authorName: "mika.r",
        fromOwner: false,
        createdAt: "2026-10-28T10:01:00Z",
      },
      { id: "c_2", text: "Yes!", authorName: "Cafe", fromOwner: true, createdAt: null },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/inbox/comments/1789");
  });

  it("listCommentedPostsPage follows the cursor and returns the next one (catch-up)", async () => {
    respond = () =>
      json({
        data: [{ id: "1789", content: "Winter menu is here" }, { id: "1790" }, { id: "1789" }],
        pagination: { hasMore: true, nextCursor: "cur_2" },
      });
    await expect(
      provider.listCommentedPostsPage({
        accountId: "acc_1",
        since: new Date("2026-08-22T12:00:00Z"),
        cursor: "cur_1",
        limit: 25,
      }),
    ).resolves.toEqual({
      postIds: ["1789", "1790"],
      // First connect (20 Nov): the caption, for the reveal's labels and top questions.
      posts: [
        { id: "1789", caption: "Winter menu is here" },
        { id: "1790", caption: null },
      ],
      nextCursor: "cur_2",
    });
    expect(Object.fromEntries(captured[0].url.searchParams)).toEqual({
      accountId: "acc_1",
      since: "2026-08-22T12:00:00.000Z",
      limit: "25",
      minComments: "1",
      sortBy: "date",
      sortOrder: "desc",
      cursor: "cur_1",
    });
  });

  it("listPostCommentsPage marks comments the account already answered (catch-up)", async () => {
    respond = () =>
      json({
        comments: [
          {
            id: "c_1",
            message: "Open Sunday?",
            createdTime: "2026-11-19T10:01:00Z",
            from: { username: "mika.r", isOwner: false },
            replies: [{ id: "r_1", from: { isOwner: true } }],
          },
          { id: "c_2", message: "Price?", from: { username: "jo", isOwner: false }, replies: [] },
        ],
        pagination: { hasMore: true, cursor: "p_2" },
      });
    const page = await provider.listPostCommentsPage({ accountId: "acc_1", postId: "1789" });
    expect(page.nextCursor).toBe("p_2");
    expect(page.comments.map((c) => [c.id, c.ownerReplied])).toEqual([
      ["c_1", true],
      ["c_2", false],
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/inbox/comments/1789");

    respond = () => json({ comments: [], pagination: { hasMore: false } });
    await expect(
      provider.listPostCommentsPage({ accountId: "acc_1", postId: "1789", cursor: "p_2" }),
    ).resolves.toEqual({ comments: [], nextCursor: null });
    expect(captured[1].url.searchParams.get("cursor")).toBe("p_2");
  });

  it("listConversations reads one account's conversations, newest first (catch-up)", async () => {
    respond = () =>
      json({
        data: [
          {
            id: "conv_1",
            platform: "instagram",
            accountId: "acc_1",
            participantId: "ig_9",
            participantName: "Mika",
            updatedTime: "2026-11-19T10:00:00Z",
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });
    await expect(provider.listConversations({ accountId: "acc_1" })).resolves.toEqual([
      {
        id: "conv_1",
        participantId: "ig_9",
        participantName: "Mika",
        updatedTime: "2026-11-19T10:00:00Z",
      },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/inbox/conversations");
    expect(Object.fromEntries(captured[0].url.searchParams)).toEqual({
      accountId: "acc_1",
      limit: "100",
      sortOrder: "desc",
    });
  });

  it("listConversations: an account Zernio couldn't read is missing DM access (first connect)", async () => {
    respond = () =>
      json({
        data: [],
        meta: {
          accountsQueried: 1,
          accountsFailed: 1,
          failedAccounts: [
            { accountId: "acc_1", platform: "instagram", error: "no access", code: null },
          ],
        },
      });
    const err = await provider.listConversations({ accountId: "acc_1" }).catch((e: unknown) => e);
    expect(isDmAccessMissing(err)).toBe(true);

    respond = () => json({ data: [], meta: { accountsSkipped: [{ accountId: "acc_1" }] } });
    const skipped = await provider
      .listConversations({ accountId: "acc_1" })
      .catch((e: unknown) => e);
    expect(isDmAccessMissing(skipped)).toBe(true);
  });

  it("listConversations: a rate-limited account is retried later, not missing access", async () => {
    respond = () =>
      json({
        data: [],
        meta: { failedAccounts: [{ accountId: "acc_1", error: "slow down", retryAfter: 30 }] },
      });
    const err = await provider.listConversations({ accountId: "acc_1" }).catch((e: unknown) => e);
    expect(isDmAccessMissing(err)).toBe(false);
    expect(err).toBeInstanceOf(SocialProviderError);
    expect((err as SocialProviderError).details).toMatchObject({
      status: 429,
      retryAfterSeconds: 30,
    });
  });

  it("getUsageByProfile reads the cycle's spend per profile (T17)", async () => {
    respond = () =>
      json({
        supported: true,
        period: { start: "2026-10-01", end: "2026-10-31", source: "cycle" },
        totals: { total: 42.5 },
        attribution: {
          groupBy: "profile",
          groups: [
            { key: "prof_a", totalUsd: 30, byProduct: { accounts: 30 } },
            { key: "prof_b", totalUsd: 10.5 },
          ],
          unattributed: { totalUsd: 2 },
          totals: { totalUsd: 42.5 },
        },
      });
    await expect(provider.getUsageByProfile()).resolves.toEqual({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      totalUsd: 42.5,
      unattributedUsd: 2,
      byProfile: [
        { profileId: "prof_a", totalUsd: 30 },
        { profileId: "prof_b", totalUsd: 10.5 },
      ],
    });
    expect(captured[0].url.pathname).toBe("/api/v1/usage");
    expect(Object.fromEntries(captured[0].url.searchParams)).toEqual({
      range: "cycle",
      groupBy: "profile",
    });
  });

  it("getAccountsHealth filters by profile and maps accounts", async () => {
    respond = () =>
      json({
        summary: { total: 1 },
        accounts: [
          {
            accountId: "acc_1",
            platform: "instagram",
            username: "democafe",
            status: "error",
            needsReconnect: true,
            canPost: false,
            issues: ["token_expired"],
          },
        ],
      });

    await expect(provider.getAccountsHealth({ profileId: "prof_1" })).resolves.toEqual([
      {
        accountId: "acc_1",
        platform: "instagram",
        username: "democafe",
        status: "error",
        needsReconnect: true,
        canPost: false,
        issues: ["token_expired"],
      },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/accounts/health");
    expect(captured[0].url.searchParams.get("profileId")).toBe("prof_1");
  });

  it("listAccountPictures reads profilePicture per account (null when missing)", async () => {
    respond = () =>
      json({
        hasAnalyticsAccess: false,
        accounts: [
          { _id: "acc_1", platform: "instagram", profilePicture: "https://cdn.example.com/p.jpg" },
          { _id: "acc_2", platform: "facebook", profilePicture: null },
          { _id: "acc_3", platform: "facebook" },
        ],
      });
    await expect(provider.listAccountPictures({ profileId: "prof_1" })).resolves.toEqual([
      { accountId: "acc_1", pictureUrl: "https://cdn.example.com/p.jpg" },
      { accountId: "acc_2", pictureUrl: null },
      { accountId: "acc_3", pictureUrl: null },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/accounts");
    expect(captured[0].url.searchParams.get("profileId")).toBe("prof_1");
  });

  describe("errors", () => {
    const send = () =>
      provider.sendDm({
        accountId: "acc_1",
        conversationId: "conv_1",
        message: "Hi",
        idempotencyKey: "k",
      });

    it("marks a 500 as ambiguous (reconcile before retrying)", async () => {
      respond = () => json({ error: "Internal error" }, 500);
      const error = await send().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SocialProviderError);
      expect((error as SocialProviderError).details).toMatchObject({
        status: 500,
        ambiguous: true,
      });
    });

    it("marks a 400 as not ambiguous and keeps the code", async () => {
      respond = () => json({ error: "Outside window", code: "platform_api_error" }, 400);
      await expect(send()).rejects.toMatchObject({
        details: { status: 400, code: "platform_api_error", ambiguous: false },
      });
    });

    it("reads the rate-limit reset on 429", async () => {
      const reset = Math.floor(Date.now() / 1000) + 30;
      respond = () =>
        json({ error: "Too many requests" }, 429, { "X-RateLimit-Reset": String(reset) });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details.status).toBe(429);
      expect(error.details.ambiguous).toBe(false);
      expect(error.details.retryAfterSeconds).toBeGreaterThan(25);
      expect(error.details.retryAfterSeconds).toBeLessThanOrEqual(30);
    });

    it("429 prefers Retry-After (seconds) over X-RateLimit-Reset (T20)", async () => {
      const reset = Math.floor(Date.now() / 1000) + 300;
      respond = () =>
        json({ error: "Too many requests" }, 429, {
          "Retry-After": "12",
          "X-RateLimit-Reset": String(reset),
        });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toMatchObject({ status: 429, retryAfterSeconds: 12, ambiguous: false });
    });

    it("429 reads Retry-After as an HTTP date", async () => {
      const at = new Date(Date.now() + 45_000).toUTCString();
      respond = () => json({ error: "Too many requests" }, 429, { "Retry-After": at });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details.retryAfterSeconds).toBeGreaterThan(40);
      expect(error.details.retryAfterSeconds).toBeLessThanOrEqual(45);
    });

    it("429 with neither header leaves the wait to the caller's fallback", async () => {
      respond = () => json({ error: "Too many requests" }, 429);
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toMatchObject({ status: 429 });
      expect(error.details.retryAfterSeconds).toBeUndefined();
    });

    it("409 with the key still in flight carries Retry-After", async () => {
      respond = () =>
        json({ error: "in flight", code: "idempotency_conflict" }, 409, { "Retry-After": "3" });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toMatchObject({ status: 409, retryAfterSeconds: 3 });
    });

    it("402 PAYMENT_REQUIRED is recognised as a platform pause (T19)", async () => {
      respond = () =>
        json(
          {
            error: "Payment required",
            code: "PAYMENT_REQUIRED",
            billingUrl: "https://zernio.com/billing",
          },
          402,
        );
      const error = await send().catch((e: unknown) => e);
      expect(isPlatformPaused(error)).toBe(true);
      expect(
        isPlatformPaused(new SocialProviderError("x", { status: 400, ambiguous: false })),
      ).toBe(false);
    });

    it("marks a network failure as ambiguous", async () => {
      respond = () => {
        throw new TypeError("fetch failed");
      };
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toEqual({ ambiguous: true });
    });

    it("rejects a 2xx response without the expected id", async () => {
      respond = () => json({ success: true, data: {} });
      await expect(send()).rejects.toMatchObject({
        message: expect.stringMatching(/unexpected response shape/),
      });
    });

    it("never puts the message text in the error", async () => {
      respond = () => json({ error: "boom" }, 500);
      const error = (await provider
        .sendDm({
          accountId: "a",
          conversationId: "c",
          message: "secret customer text",
          idempotencyKey: "k",
        })
        .catch((e: unknown) => e)) as Error;
      expect(error.message).not.toContain("secret customer text");
    });
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  it("reads seconds and HTTP dates, ignores junk", () => {
    expect(parseRetryAfter("30", now)).toBe(30);
    expect(parseRetryAfter("Thu, 29 Oct 2026 12:01:00 GMT", now)).toBe(60);
    expect(parseRetryAfter("Thu, 29 Oct 2026 11:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});

describe("pickTikTokPrivacy", () => {
  it("prefers public, else the first level TikTok offers", () => {
    expect(pickTikTokPrivacy(["SELF_ONLY", "PUBLIC_TO_EVERYONE"])).toBe("PUBLIC_TO_EVERYONE");
    expect(pickTikTokPrivacy([undefined, "FOLLOWER_OF_CREATOR"])).toBe("FOLLOWER_OF_CREATOR");
    expect(pickTikTokPrivacy([])).toBeNull();
  });
});
