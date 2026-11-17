import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/components/app/theme";
import "./globals.css";

// docs/design.md §3: Outfit for headings and the wordmark, Inter for everything else.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Waggle", template: "%s · Waggle" },
  description: "AI that runs your socials.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set before paint by the boot script (light, dark or the device's choice),
    // so React must not warn that the server didn't render it.
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
