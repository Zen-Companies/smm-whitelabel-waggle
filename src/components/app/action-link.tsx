import Link from "next/link";
import { cn } from "cn";

/**
 * A card's action (design.md §4 "Beyond text", rule 1, approved 16 Nov): ink, semibold, an
 * arrow; a soft pill and a nudge on hover. Never underlined. "Plan posts →", "See all →".
 */
export function ActionLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("action-link with-arrow", className)}>
      {children}
    </Link>
  );
}
