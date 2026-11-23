// Which wallet mark the upgrade pop-up's dark pay button shows (approved 23 Nov). Pure: the
// browser facts come in as arguments, so it's tested with plain UA strings. The button still
// opens Stripe Checkout; Checkout itself offers the wallet the device supports.

export type Wallet = "apple" | "google" | "none";

export type WalletFacts = {
  userAgent: string;
  /** `window.ApplePaySession` exists (Safari on Apple devices). */
  hasApplePaySession: boolean;
  /** `window.PaymentRequest` exists (Chromium browsers). */
  hasPaymentRequest: boolean;
};

const IOS = /iPhone|iPad|iPod/;
const MAC = /Macintosh|Mac OS X/;
const NOT_SAFARI = /Chrome|Chromium|CriOS|FxiOS|EdgiOS|EdgA?\/|OPR\/|OPiOS|Firefox|SamsungBrowser/;
const FIREFOX = /Firefox\/|FxiOS/;
const CHROMIUM = /Chrome\/|Chromium\//;

export function detectWallet({
  userAgent,
  hasApplePaySession,
  hasPaymentRequest,
}: WalletFacts): Wallet {
  if (hasApplePaySession) return "apple";
  if (FIREFOX.test(userAgent)) return "none";
  // Every iOS browser runs WebKit; Apple Pay is what Checkout offers there.
  if (IOS.test(userAgent)) return "apple";
  if (MAC.test(userAgent) && /Safari\//.test(userAgent) && !NOT_SAFARI.test(userAgent)) {
    return "apple";
  }
  if (CHROMIUM.test(userAgent) && hasPaymentRequest) return "google";
  return "none";
}

/** In the browser only; "none" on the server. */
export function browserWallet(): Wallet {
  if (typeof window === "undefined") return "none";
  return detectWallet({
    userAgent: window.navigator.userAgent,
    hasApplePaySession: "ApplePaySession" in window,
    hasPaymentRequest: "PaymentRequest" in window,
  });
}
