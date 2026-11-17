"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/app/section-tabs";

const TABS = [
  { key: "/posts", href: "/posts", label: "Calendar" },
  { key: "/posts/queue", href: "/posts/queue", label: "Posting times" },
  { key: "/posts/ads", href: "/posts/ads", label: "Ads" },
  { key: "/posts/blog", href: "/posts/blog", label: "Blog" },
  { key: "/posts/shop", href: "/posts/shop", label: "Shop" },
] as const;

/**
 * The top of every Posts section (design.md §4 "Beyond text", rule 2, approved 16 Nov): the
 * title, one line, and the parts of Posts as tabs instead of a row of underlined links.
 */
export function PostsHeader({ line }: { line?: string }) {
  const pathname = usePathname();
  const active =
    TABS.slice()
      .reverse()
      .find((t) => pathname === t.key || pathname.startsWith(`${t.key}/`))?.key ?? "/posts";
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Posts</h1>
        <p className="text-ink-2">
          {line ??
            "Write once. Waggle posts it everywhere you pick, and answers the comments after."}
        </p>
      </div>
      <SectionTabs label="Posts" items={TABS} active={active} />
    </header>
  );
}
