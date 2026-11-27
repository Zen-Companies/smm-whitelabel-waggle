import { describe, expect, it } from "vitest";
import {
  autoSwitchUrl,
  blockedPlatforms,
  cardCopy,
  iosMajor,
  noteCopy,
  plainPageUrl,
  safariSwitchUrl,
  switchDetails,
} from "./in-app-switch";

const IOS17 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_32.5.0 BytedanceWebview/d8a21c6";
const IOS16 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_30.8.0 BytedanceWebview/d8a21c6";
const IPAD18 = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 Mobile Safari/537.36 trill_370200 BytedanceWebview/d8a21c6";

describe("plainPageUrl", () => {
  it("keeps the plan, a friend's code and the campaign, nothing secret", () => {
    expect(
      plainPageUrl(
        "https://app.waggle.test/signup?plan=solo&ref=CAFE12&utm_source=tiktok&utm_campaign=nov_ads&code=abc&session_id=cs_1&token=t#x",
      ),
    ).toBe(
      "https://app.waggle.test/signup?plan=solo&ref=CAFE12&utm_source=tiktok&utm_campaign=nov_ads",
    );
  });
  it("drops next, errors and auth codes from sign-in", () => {
    expect(
      plainPageUrl("https://app.waggle.test/login?next=%2Foauth%2Fconsent%3Fx%3D1&error=google"),
    ).toBe("https://app.waggle.test/login");
  });
  it("drops odd values, and all unless it's 1", () => {
    expect(plainPageUrl("https://app.waggle.test/signup?ref=%3Cscript%3E&all=yes")).toBe(
      "https://app.waggle.test/signup",
    );
  });
});

describe("iosMajor", () => {
  it("reads the iPhone and iPad version", () => {
    expect(iosMajor(IOS17)).toBe(17);
    expect(iosMajor(IOS16)).toBe(16);
    expect(iosMajor(IPAD18)).toBe(18);
    expect(iosMajor(ANDROID)).toBeNull();
  });
});

describe("safariSwitchUrl", () => {
  it("asks iOS 17+ to open the https page in Safari", () => {
    expect(safariSwitchUrl("https://app.waggle.test/signup?plan=solo", IOS17)).toBe(
      "x-safari-https://app.waggle.test/signup?plan=solo",
    );
  });
  it("not before iOS 17, nor for http pages", () => {
    expect(safariSwitchUrl("https://app.waggle.test/signup", IOS16)).toBeNull();
    expect(safariSwitchUrl("http://localhost:3000/signup", IOS17)).toBeNull();
    expect(safariSwitchUrl("nope", IOS17)).toBeNull();
  });
});

describe("autoSwitchUrl", () => {
  const href = "https://app.waggle.test/signup?plan=team&code=secret";
  it("Android: Chrome's intent link to the plain page", () => {
    expect(autoSwitchUrl(href, ANDROID, { app: "TikTok", level: "card", device: "android" })).toBe(
      "intent://app.waggle.test/signup?plan=team#Intent;scheme=https;package=com.android.chrome;" +
        "S.browser_fallback_url=" +
        encodeURIComponent("https://app.waggle.test/signup?plan=team") +
        ";end",
    );
  });
  it("Android, an app it can't name: nothing (its WebView may show an error page)", () => {
    expect(
      autoSwitchUrl(href, ANDROID, { app: null, level: "note", device: "android" }),
    ).toBeNull();
  });
  it("iPhone: x-safari-https on iOS 17+, the plain page", () => {
    expect(autoSwitchUrl(href, IOS17, { app: "TikTok", level: "card", device: "ios" })).toBe(
      "x-safari-https://app.waggle.test/signup?plan=team",
    );
    expect(autoSwitchUrl(href, IOS17, { app: null, level: "note", device: "ios" })).toBe(
      "x-safari-https://app.waggle.test/signup?plan=team",
    );
    expect(autoSwitchUrl(href, IOS16, { app: "TikTok", level: "card", device: "ios" })).toBeNull();
  });
});

describe("cardCopy", () => {
  it("sign-up on iPhone (board A)", () => {
    expect(cardCopy("TikTok", "ios", "signup")).toEqual({
      title: "Open Waggle in Safari first",
      body: "TikTok’s browser breaks the sign-in to your accounts. Two taps and you’re there, then sign up as usual.",
      footer: "Nothing is lost: you start fresh in Safari.",
      copyLabel: "Copy link instead",
    });
  });
  it("Android (board B)", () => {
    const c = cardCopy("Instagram", "android", "signin");
    expect(c.title).toBe("Open Waggle in Chrome first");
    expect(c.body).toBe(
      "Instagram’s browser breaks the sign-in to your accounts. One tap and you’re there.",
    );
    expect(c.copyLabel).toBe("Copy link");
  });
  it("sign-in says sign in", () => {
    expect(cardCopy("Facebook", "ios", "signin").body).toMatch(/then sign in as usual\.$/);
  });
  it("Connect keeps today's words for Meta and adds TikTok", () => {
    expect(cardCopy("Instagram", "ios", "connect")).toMatchObject({
      title: "Open Waggle in Safari to connect",
      body: "Instagram and Facebook can’t sign in inside Instagram’s app. Two taps and you’re back.",
    });
    expect(cardCopy("TikTok", "android", "connect").body).toBe(
      "TikTok’s browser breaks the sign-in to your accounts. One tap and you’re back.",
    );
  });
});

describe("noteCopy", () => {
  it("names the app, or says another app", () => {
    expect(noteCopy({ app: "LinkedIn", device: "ios" })).toEqual({
      who: "LinkedIn’s browser",
      browser: "Safari",
      menu: "•••",
    });
    expect(noteCopy({ app: null, device: "android" })).toEqual({
      who: "another app’s browser",
      browser: "Chrome",
      menu: "⋮",
    });
  });
});

describe("switchDetails", () => {
  it("records the app, phone, page and outcome, nothing else", () => {
    expect(
      switchDetails({ app: "Google app", level: "note", device: "ios" }, "signup", true),
    ).toEqual({ app: "google_app", level: "note", device: "ios", where: "signup", stayed: true });
    expect(
      switchDetails({ app: null, level: "note", device: "android" }, "connect", false).app,
    ).toBe("unknown");
  });
});

describe("blockedPlatforms", () => {
  it("Meta inside Meta's apps; TikTok and Meta inside TikTok", () => {
    expect(blockedPlatforms("Instagram")).toEqual(["instagram", "facebook"]);
    expect(blockedPlatforms("Messenger")).toEqual(["instagram", "facebook"]);
    expect(blockedPlatforms("TikTok")).toEqual(["instagram", "facebook", "tiktok"]);
  });
});
