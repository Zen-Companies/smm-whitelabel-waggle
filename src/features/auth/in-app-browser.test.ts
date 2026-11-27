import { describe, expect, it } from "vitest";
import {
  breakerApp,
  detectInApp,
  deviceOf,
  inAppName,
  isInAppBrowser,
  namedApp,
} from "./in-app-browser";

// Real user agents, as each app sends them (TikTok's from ad clicks; the rest from the apps'
// in-app browsers and the phones' own browsers).
const UA = {
  tiktokIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_37.2.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US BytedanceWebview/d8a21c6",
  tiktokIos17:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_32.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US ByteFullLocale/en-US isDarkMode/0 WKWebView/1 RevealType/Dialog BytedanceWebview/d8a21c6 FalconTag/",
  tiktokIos16:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_30.8.0 JsSdk/2.0 NetType/4G Channel/App Store ByteLocale/en Region/GB isDarkMode/1 WKWebView/1 RevealType/Dialog BytedanceWebview/d8a21c6",
  tiktokIosTrill:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 trill_33.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/ja Region/JP isDarkMode/0",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 trill_370200 BytedanceWebview/d8a21c6",
  tiktokAndroidSamsung:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 trill_320304 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/trill app_version/32.3.4 ByteLocale/en ByteFullLocale/en Region/US Spark/1.4.6.3-bugfix AppVersion/32.3.4 BytedanceWebview/d8a21c6",
  tiktokAndroidMusically:
    "Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SQ3A.220705.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/103.0.5060.71 Mobile Safari/537.36 musical_ly_2022600030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/26.0.3 ByteLocale/en ByteFullLocale/en Region/US",
  tiktokLite:
    "Mozilla/5.0 (Linux; Android 11; SM-A125F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.5993.111 Mobile Safari/537.36 musically_go_31.2.3 AppName/musically_go",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_1; en_US; en; scale=3.00; 1179x2556)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-G991B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 Instagram 314.0.0.35.109 Android (34/14; 480dpi; 1080x2176; samsung; SM-G991B; o1s; exynos2100; en_US; 556347127)",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1]",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
  messengerIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/445.0.0.30.110;FBBV/551432109;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.2;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]",
  messengerAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/440.0.0.29.109;]",
  linkedinIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.6463",
  linkedinAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.5993.80 Mobile Safari/537.36 [LinkedInApp]/4.1.881",
  snapchatIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.60.0.40 (like Safari/8616.1.10, panda)",
  xAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 TwitterAndroid",
  pinterestIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]",
  redditIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Reddit/Version 2023.45.0/Build 1234567/iOS Version 17.1",
  lineIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.17.0",
  telegramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Telegram-Android/10.2.6 (Google Pixel 8; Android 14; SDK 34; AVERAGE)",
  wechatIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2f) NetType/WIFI Language/en",
  googleAppIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/290.0.585854346 Mobile/15E148 Safari/604.1",
  unknownIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.0.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
  firefoxIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15",
  edgeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/120.2210.126 Mobile/15E148 Safari/605.1.15",
  duckduckgoIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  edgeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.2210.115",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",
  operaAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 OPR/79.0.4195.76080",
  chromeDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  safariDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  facebookDesktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 FBAV/1",
};

describe("detectInApp: named apps", () => {
  it.each([
    ["tiktokIos", "TikTok"],
    ["tiktokIos17", "TikTok"],
    ["tiktokIos16", "TikTok"],
    ["tiktokIosTrill", "TikTok"],
    ["tiktokAndroid", "TikTok"],
    ["tiktokAndroidSamsung", "TikTok"],
    ["tiktokAndroidMusically", "TikTok"],
    ["tiktokLite", "TikTok"],
    ["instagramIos", "Instagram"],
    ["instagramAndroid", "Instagram"],
    ["facebookIos", "Facebook"],
    ["facebookAndroid", "Facebook"],
    ["messengerIos", "Messenger"],
    ["messengerAndroid", "Messenger"],
  ] as const)("%s is %s, a known breaker: the full card", (key, app) => {
    expect(detectInApp(UA[key])).toEqual({ app, level: "card", device: deviceOf(UA[key]) });
  });

  it.each([
    ["linkedinIos", "LinkedIn"],
    ["linkedinAndroid", "LinkedIn"],
    ["snapchatIos", "Snapchat"],
    ["xAndroid", "X"],
    ["pinterestIos", "Pinterest"],
    ["redditIos", "Reddit"],
    ["lineIos", "LINE"],
    ["telegramAndroid", "Telegram"],
    ["wechatIos", "WeChat"],
    ["googleAppIos", "Google app"],
  ] as const)("%s is %s: the gentle note", (key, app) => {
    expect(detectInApp(UA[key])).toEqual({ app, level: "note", device: deviceOf(UA[key]) });
  });
});

describe("detectInApp: apps it can't name", () => {
  it("Android: the WebView's ; wv) marker", () => {
    expect(detectInApp(UA.androidWebview)).toEqual({ app: null, level: "note", device: "android" });
  });
  it("iPhone: mobile WebKit without the Safari tag", () => {
    expect(detectInApp(UA.unknownIos)).toEqual({ app: null, level: "note", device: "ios" });
  });
  it("never Waggle saved to the home screen", () => {
    expect(detectInApp(UA.unknownIos, { standalone: true })).toBeNull();
  });
});

describe("detectInApp: real browsers and computers are never flagged", () => {
  it.each([
    "safariIos",
    "safariIpad",
    "chromeIos",
    "firefoxIos",
    "edgeIos",
    "duckduckgoIos",
    "chromeAndroid",
    "samsungAndroid",
    "edgeAndroid",
    "firefoxAndroid",
    "operaAndroid",
    "chromeDesktop",
    "safariDesktop",
    "facebookDesktop",
  ] as const)("%s", (key) => {
    expect(detectInApp(UA[key])).toBeNull();
    expect(detectInApp(UA[key], { standalone: true })).toBeNull();
  });
  it("nothing to go on", () => {
    expect(detectInApp(null)).toBeNull();
    expect(detectInApp("")).toBeNull();
  });
});

describe("breakerApp", () => {
  it("only Instagram, Facebook, Messenger and TikTok", () => {
    expect(breakerApp(UA.tiktokAndroid)).toBe("TikTok");
    expect(breakerApp(UA.messengerIos)).toBe("Messenger");
    expect(breakerApp(UA.linkedinIos)).toBeNull();
    expect(breakerApp(UA.unknownIos)).toBeNull();
    expect(breakerApp(UA.safariIos)).toBeNull();
  });
});

describe("namedApp", () => {
  it("WeChat isn't Messenger", () => {
    expect(namedApp(UA.wechatIos)).toBe("WeChat");
  });
});

describe("isInAppBrowser", () => {
  it("catches the TikTok, Instagram and Facebook browsers the ads open in", () => {
    expect(isInAppBrowser(UA.tiktokIos)).toBe(true);
    expect(isInAppBrowser(UA.tiktokAndroid)).toBe(true);
    expect(isInAppBrowser(UA.instagramIos)).toBe(true);
    expect(isInAppBrowser(UA.facebookIos)).toBe(true);
    expect(isInAppBrowser(UA.androidWebview)).toBe(true);
    expect(isInAppBrowser(UA.linkedinIos)).toBe(true);
  });
  it("leaves real browsers alone, where Google sign-in works", () => {
    expect(isInAppBrowser(UA.safariIos)).toBe(false);
    expect(isInAppBrowser(UA.chromeAndroid)).toBe(false);
    expect(isInAppBrowser(UA.samsungAndroid)).toBe(false);
    expect(isInAppBrowser(UA.chromeDesktop)).toBe(false);
    expect(isInAppBrowser("")).toBe(false);
    expect(isInAppBrowser(undefined)).toBe(false);
  });
});

describe("inAppName", () => {
  it("names the app for the notice", () => {
    expect(inAppName(UA.tiktokIos)).toBe("TikTok");
    expect(inAppName(UA.tiktokAndroid)).toBe("TikTok");
    expect(inAppName(UA.instagramIos)).toBe("Instagram");
    expect(inAppName(UA.facebookIos)).toBe("Facebook");
    expect(inAppName(UA.messengerAndroid)).toBe("Messenger");
    expect(inAppName(UA.androidWebview)).toBe("this app");
  });
});
