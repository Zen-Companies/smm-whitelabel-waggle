import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

// docs/design.md §3: Outfit for everything, one family.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Waggle", template: "%s · Waggle" },
  description: "AI that runs your socials.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
