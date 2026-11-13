// Whitelabel (T68): customers never see the name of Waggle's social layer.

/**
 * Branding for Zernio's hosted connect pages (`GET /v1/connect/{platform}`): the welcome screen
 * ("Waggle wants to connect to your Instagram") and the account pickers after it. Zernio refuses a
 * logo that isn't https, so local dev shows the first letter of the name instead.
 */
export function connectBranding(appUrl: string): {
  welcome: true;
  brandName: string;
  primaryColor: string;
  logoUrl?: string;
} {
  const base = appUrl.replace(/\/+$/, "");
  return {
    welcome: true,
    brandName: "Waggle",
    primaryColor: "#F6B21B",
    ...(base.startsWith("https://") ? { logoUrl: `${base}/brand/waggle-app-icon.svg` } : {}),
  };
}

/** Text from the social layer (a platform's reason a post failed) made safe to show an owner. */
export function customerText(text: string | null): string | null {
  if (!text) return text;
  return text.replace(/zernio/gi, "our posting service");
}
