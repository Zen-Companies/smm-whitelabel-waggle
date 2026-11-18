// "Before you connect" (design "Every Zernio platform", approved 18 Nov). Pure: no I/O.
//
// Decided on each click from the link Zernio returns: when it opens Zernio's welcome page with
// our brand (which says "Secured by zernio"), the owner goes straight there. When it goes
// straight to the platform's own page (which names Zernio), Waggle says so first, in place.
// Platforms with pay-per-use always get the note, for the costs.

/** The link opens Zernio's welcome page with our brand (or, under the mock, comes straight back). */
export function opensWelcome(authUrl: string, appUrl: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(authUrl);
  } catch {
    return false;
  }
  if (url.hostname === "zernio.com" && url.pathname.startsWith("/connect/welcome")) return true;
  // The mock provider (local and tests) sends the browser straight back to Waggle.
  if (appUrl) {
    try {
      if (url.host === new URL(appUrl).host) return true;
    } catch {
      // fall through
    }
  }
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export interface ConnectNoteCopy {
  /** The platform's own name, for "Continue to …". */
  platform: string;
  /** What the owner is about to see, in the platform's words; null when not checked. */
  youllSee: string | null;
  /** What Waggle can do with the connection. */
  access: string;
  /** Where Zernio's name shows after connecting, if anywhere. */
  after?: string;
  /** Pay-per-use, shown before connecting (the platform's own prices, charged at cost). */
  costs?: { label: string; price: string }[];
}

const GOOGLE_SEE = "Choose an account to continue to Zernio";

const NOTES: Record<string, ConnectNoteCopy> = {
  googleanalytics: {
    platform: "Google",
    youllSee: GOOGLE_SEE,
    // Google's page asks for analytics.readonly and analytics.edit (seen on a real connect,
    // 18 Nov), though Zernio's docs say read only: say what Google will ask, honestly.
    access:
      "Waggle reads your website visits. Google also asks to let Zernio edit Analytics settings; Waggle never changes them.",
  },
  googleads: {
    platform: "Google",
    youllSee: GOOGLE_SEE,
    access: "Waggle can see your Google Ads accounts and manage the ads you create from Waggle.",
  },
  gmail: {
    platform: "Google",
    youllSee: GOOGLE_SEE,
    access: "Waggle can read and send email and see your calendar, for your inbox.",
  },
  outlook: {
    platform: "Microsoft",
    youllSee: null,
    access: "Waggle can read and send email, see your calendar and pick files from OneDrive.",
  },
  slack: {
    platform: "Slack",
    youllSee: null,
    access: "You'll pick one channel for Waggle next.",
    after: "In Slack, the messages Waggle posts show as coming from Zernio.",
  },
  // 18 Nov: the rest of Zernio's connections; what each can do, from its Zernio docs page.
  wix: {
    platform: "Wix",
    youllSee: null,
    access: "You pick a site and approve Zernio's app; Waggle can write blog posts there.",
  },
  hubspot: {
    platform: "HubSpot",
    youllSee: null,
    access: "Waggle adds your inbox contacts and their messages to HubSpot.",
    after: "In HubSpot, the app is listed as Zernio.",
  },
  salesforce: {
    platform: "Salesforce",
    youllSee: null,
    access: "Waggle matches your inbox contacts to Contacts and Leads and logs each conversation.",
  },
  stripe: {
    platform: "Stripe",
    youllSee: null,
    access: "Waggle only reads payments, so sales count on the ads that brought them.",
    after: "In Stripe, the connected app is listed as Zernio.",
  },
  tiktokads: {
    platform: "TikTok",
    youllSee: null,
    access: "Waggle can see your TikTok ad accounts and their results.",
  },
  redditads: {
    platform: "Reddit",
    youllSee: null,
    access: "Waggle can see your Reddit ad accounts and their results.",
  },
  microsoftads: {
    platform: "Microsoft",
    youllSee: null,
    access: "Waggle can see your Microsoft Advertising accounts and their results.",
  },
  xads: {
    platform: "X",
    youllSee: null,
    access: "Waggle can see your X ad accounts and their results.",
  },
  twitter: {
    platform: "X",
    youllSee: null,
    access: "Waggle posts for you and answers mentions and DMs.",
    // docs.zernio.com/pricing/social (X's published rates, passed through at cost), 18 Nov.
    costs: [
      { label: "A post", price: "$0.015" },
      { label: "A post with a link", price: "$0.20" },
      { label: "Sending a DM", price: "$0.015" },
      { label: "Reading a DM", price: "$0.01" },
    ],
  },
};

export function connectNoteCopy(id: string, label: string): ConnectNoteCopy {
  return (
    NOTES[id] ?? {
      platform: label,
      youllSee: null,
      access: "You choose what to allow on the next page, and can remove it any time here.",
    }
  );
}

/** Whether the owner sees the note before going on. */
export function needsConnectNote(id: string, authUrl: string, appUrl: string | undefined): boolean {
  return !!NOTES[id]?.costs || !opensWelcome(authUrl, appUrl);
}

/** Where Continue may send the browser: a web address on https (never javascript: or our own). */
export function safeContinueUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.hostname === "localhost" ? url.toString() : null;
  } catch {
    return null;
  }
}
