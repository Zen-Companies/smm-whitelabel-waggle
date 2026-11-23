import { describe, expect, it } from "vitest";
import { detectWallet } from "./wallet";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  macFirefox:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
};

const facts = (userAgent: string, applePay = false, paymentRequest = false) => ({
  userAgent,
  hasApplePaySession: applePay,
  hasPaymentRequest: paymentRequest,
});

describe("detectWallet", () => {
  it("iPhone Safari → Apple Pay", () => {
    expect(detectWallet(facts(UA.iphoneSafari, true, true))).toBe("apple");
    expect(detectWallet(facts(UA.iphoneSafari))).toBe("apple");
  });
  it("Mac Safari → Apple Pay", () => {
    expect(detectWallet(facts(UA.macSafari, true, true))).toBe("apple");
    expect(detectWallet(facts(UA.macSafari))).toBe("apple");
  });
  it("Android Chrome → Google Pay", () => {
    expect(detectWallet(facts(UA.androidChrome, false, true))).toBe("google");
  });
  it("desktop Chrome (also on a Mac) → Google Pay", () => {
    expect(detectWallet(facts(UA.desktopChrome, false, true))).toBe("google");
    expect(detectWallet(facts(UA.macChrome, false, true))).toBe("google");
  });
  it("Chrome without PaymentRequest → none", () => {
    expect(detectWallet(facts(UA.desktopChrome))).toBe("none");
  });
  it("Firefox → none", () => {
    expect(detectWallet(facts(UA.firefox, false, true))).toBe("none");
    expect(detectWallet(facts(UA.macFirefox, false, true))).toBe("none");
  });
  it("unknown → none", () => {
    expect(detectWallet(facts("curl/8.0"))).toBe("none");
  });
});
