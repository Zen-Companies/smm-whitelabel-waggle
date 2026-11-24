import { describe, expect, it } from "vitest";
import {
  blockedDetails,
  chromeIntentUrl,
  deviceOf,
  isDesktop,
  leaveSteps,
  switchNote,
  switchSteps,
  usableHere,
} from "./connect-help";

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_1; en_US; en; scale=3.00; 1179x2556)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
  chromeDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
};

describe("deviceOf", () => {
  it("tells iPhone, iPad and Android apart", () => {
    expect(deviceOf(UA.instagramIos)).toBe("ios");
    expect(deviceOf(UA.ipad)).toBe("ios");
    expect(deviceOf(UA.facebookAndroid)).toBe("android");
    expect(deviceOf(UA.chromeDesktop)).toBe("other");
    expect(deviceOf(null)).toBe("other");
  });
});

describe("isDesktop", () => {
  it("is true only for computers", () => {
    expect(isDesktop(UA.chromeDesktop)).toBe(true);
    expect(isDesktop(UA.windows)).toBe(true);
    expect(isDesktop(UA.instagramIos)).toBe(false);
    expect(isDesktop(UA.facebookAndroid)).toBe(false);
    expect(isDesktop(undefined)).toBe(false);
  });
});

describe("usableHere", () => {
  const ids = ["facebook", "instagram", "tiktok", "linkedin"] as const;
  it("drops only Instagram and Facebook inside their in-app browsers", () => {
    expect(usableHere(ids, "Instagram")).toEqual(["tiktok", "linkedin"]);
    expect(usableHere(ids, "Facebook")).toEqual(["tiktok", "linkedin"]);
  });
  it("keeps every tile in a normal browser", () => {
    expect(usableHere(ids, null)).toEqual([...ids]);
  });
});

describe("leaveSteps", () => {
  it("iPhone: ••• then Open in browser, to Safari", () => {
    const s = leaveSteps("ios");
    expect(s.browser).toBe("Safari");
    expect(s.menu).toBe("•••");
    expect(s.steps.map((x) => x.label)).toEqual([
      "Tap ••• at the top right",
      "Tap Open in browser",
    ]);
  });
  it("Android: ⋮ then Open in Chrome", () => {
    const s = leaveSteps("android");
    expect(s.browser).toBe("Chrome");
    expect(s.steps.map((x) => x.label)).toEqual(["Tap ⋮ at the top right", "Tap Open in Chrome"]);
  });
});

describe("switchSteps", () => {
  it("draws three steps per platform with the reassurance", () => {
    expect(switchSteps("instagram")).toHaveLength(3);
    expect(switchSteps("instagram")[2]?.label).toBe("Account type → Switch to professional");
    expect(switchSteps("facebook")).toHaveLength(3);
    expect(switchNote("instagram")).toBe("Free. Your posts and followers stay the same.");
  });
});

describe("chromeIntentUrl", () => {
  it("hands the same page to Chrome, falling back to it in any browser", () => {
    const url = "https://app.waggle.test/auth/handoff?id=abc&token_hash=xyz";
    expect(chromeIntentUrl(url)).toBe(
      "intent://app.waggle.test/auth/handoff?id=abc&token_hash=xyz#Intent;scheme=https;" +
        "package=com.android.chrome;S.browser_fallback_url=" +
        encodeURIComponent(url) +
        ";end",
    );
  });
  it("keeps the port and the plain http scheme (local)", () => {
    expect(chromeIntentUrl("http://localhost:3000/welcome")).toBe(
      "intent://localhost:3000/welcome#Intent;scheme=http;package=com.android.chrome;" +
        "S.browser_fallback_url=http%3A%2F%2Flocalhost%3A3000%2Fwelcome;end",
    );
  });
  it("refuses anything that is not a web page", () => {
    expect(chromeIntentUrl("javascript:alert(1)")).toBeNull();
    expect(chromeIntentUrl("not a url")).toBeNull();
  });
});

describe("blockedDetails", () => {
  it("records the app, its browser class and the phone, nothing else", () => {
    expect(blockedDetails("Instagram", "ios")).toEqual({
      platform: "instagram",
      browser_class: "in_app_instagram",
      device: "ios",
    });
    expect(blockedDetails("Facebook", "android").browser_class).toBe("in_app_facebook");
  });
});
