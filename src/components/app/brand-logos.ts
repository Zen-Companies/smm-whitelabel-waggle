// Official brand logos in public/brands (design.md §2). Platform ids from lib/social/platforms,
// plus the channels and tools Waggle connects to.

const FILES = {
  instagram: "instagram.png",
  facebook: "facebook.png",
  googlebusiness: "google.png",
  google: "google.png",
  tiktok: "tiktok.png",
  threads: "threads.svg",
  youtube: "youtube.png",
  linkedin: "linkedin.png",
  bluesky: "bluesky.svg",
  twitter: "x.svg",
  whatsapp: "whatsapp.svg",
  telegram: "telegram.svg",
  pinterest: "pinterest.svg",
  discord: "discord.svg",
  reddit: "reddit.svg",
  snapchat: "snapchat.svg",
  line: "line.png",
  wechat: "wechat.svg",
  slack: "slack.svg",
  imessage: "imessage.svg",
  rcs: "rcs.svg",
  sms: "sms.svg",
  email: "email.svg",
  // Zernio's platform id for a mailbox connected with our own email form (T81b).
  imap: "email.svg",
  phone: "phone.svg",
  gmail: "gmail.svg",
  outlook: "outlook.svg",
  googlecalendar: "googlecalendar.svg",
  googledrive: "googledrive.png",
  onedrive: "onedrive.svg",
  shopify: "shopify.svg",
  woocommerce: "woocommerce.svg",
  wordpress: "wordpress.svg",
  wix: "wix.svg",
  webflow: "webflow.svg",
  hubspot: "hubspot.svg",
  googleanalytics: "googleanalytics.svg",
  stripe: "stripe.svg",
  metaads: "meta.svg",
  googleads: "googleads.svg",
  tiktokads: "tiktok.png",
} as const;

export type BrandSlug = keyof typeof FILES;

export function isBrandSlug(slug: string): slug is BrandSlug {
  return Object.hasOwn(FILES, slug);
}

/** Path of a brand's logo, or null when Waggle has none for it. */
export function brandLogo(slug: string): string | null {
  return isBrandSlug(slug) ? `/brands/${FILES[slug]}` : null;
}
