import type { Metadata } from "next";
import { DemoProvider } from "./_demo/store";
import { Shell } from "./_demo/shell";
import "./system.css";

// A clickable prototype with sample data, so it stays out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <Shell>{children}</Shell>
    </DemoProvider>
  );
}
