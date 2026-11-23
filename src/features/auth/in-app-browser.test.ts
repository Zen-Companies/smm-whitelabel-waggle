import { describe, expect, it } from "vitest";
import { inAppName, isInAppBrowser } from "./in-app-browser";

// Representative user agents (shapes as each app sends them).
const UA = {
  tiktokIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_37.2.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US BytedanceWebview/d8a21c6",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 trill_370200 BytedanceWebview/d8a21c6",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_1; en_US; en; scale=3.00; 1179x2556)",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1]",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.0.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("isInAppBrowser", () => {
  it("catches the TikTok, Instagram and Facebook browsers the ads open in", () => {
    expect(isInAppBrowser(UA.tiktokIos)).toBe(true);
    expect(isInAppBrowser(UA.tiktokAndroid)).toBe(true);
    expect(isInAppBrowser(UA.instagramIos)).toBe(true);
    expect(isInAppBrowser(UA.facebookIos)).toBe(true);
    expect(isInAppBrowser(UA.androidWebview)).toBe(true);
  });
  it("leaves real browsers alone, where Google sign-in works", () => {
    expect(isInAppBrowser(UA.safariIos)).toBe(false);
    expect(isInAppBrowser(UA.chromeAndroid)).toBe(false);
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
    expect(inAppName(UA.androidWebview)).toBe("this app");
  });
});
