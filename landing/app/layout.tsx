import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const DESCRIPTION =
  "Waggle is an AI social media manager for small businesses. It schedules your posts to Instagram, Facebook, TikTok, YouTube, LinkedIn and 9 more platforms, answers comments and DMs from your business info in seconds, and tells you which customers are ready to buy.";

export const metadata: Metadata = {
  title: "Waggle · AI social media manager for small businesses",
  description: DESCRIPTION,
  keywords: [
    "AI social media manager",
    "social media automation for small business",
    "Instagram auto reply",
    "Facebook comment auto reply",
    "Instagram DM automation",
    "TikTok scheduler",
    "LinkedIn post scheduler",
    "post to all social media at once",
    "social media scheduler",
    "AI customer replies",
    "lead capture from social media",
  ],
  openGraph: {
    title: "Waggle · Your socials, handled.",
    description: DESCRIPTION,
    siteName: "Waggle",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Waggle · Your socials, handled.", description: DESCRIPTION },
};

// Structured data so search engines and AI answer engines can state plainly what Waggle is and does.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Waggle",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  audience: { "@type": "BusinessAudience", audienceType: "Small businesses such as cafés, salons and local shops" },
  offers: { "@type": "Offer", price: "79", priceCurrency: "USD", description: "Pilot plan with a 14-day free trial, then billed monthly, up to 5 connected accounts" },
  featureList: [
    "Schedules posts to Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Threads, Pinterest, Bluesky, WhatsApp, Telegram, Discord, Snapchat and Google Business",
    "Answers comments and DMs from your business info in seconds",
    "Never makes up prices; asks the owner when info is missing",
    "Flags customers who are ready to buy and emails them to the owner",
    "Owner approves replies, with an 8 second undo",
  ],
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff6e6" },
    { media: "(prefers-color-scheme: dark)", color: "#17140f" },
  ],
};

// Runs before first paint. Default is the visitor's device setting (prefers-color-scheme);
// a choice made with the toggle is remembered. With no stored choice the page also follows
// the device live, e.g. when a phone switches to dark mode at sunset.
const themeScript = `(function(){var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function s(){try{return localStorage.getItem("waggle-theme")}catch(e){return null}}function a(){var t=s();if(t!=="light"&&t!=="dark")t=m.matches?"dark":"light";d.dataset.theme=t}a();m.addEventListener("change",function(){if(!s())a()});d.classList.add("js")})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      </head>
      <body className="min-h-full pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</body>
    </html>
  );
}
