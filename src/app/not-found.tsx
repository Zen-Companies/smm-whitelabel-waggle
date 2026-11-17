import Link from "next/link";
import { BeeLost } from "@/components/app/bee";
import { Brand } from "@/components/app/brand";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/** 404 (docs/design.md §6): the bee loses the figure-8. The one place for a little humor. */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Brand />
      <BeeLost className="mt-6" />
      <h1 className="page-title">This page flew off</h1>
      <p className="text-ink-2 max-w-sm">
        The link may be old, or the page moved. Your messages and leads are safe, right where you
        left them.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/today" className={buttonVariants({ variant: "primary" })}>
          Go to Today
        </Link>
        <Link href="/inbox" className={buttonVariants({ variant: "secondary" })}>
          Open the Inbox
        </Link>
      </div>
      <p className="text-ink-3 text-sm">
        Keep landing here? Tell us with Send feedback and we&apos;ll fix the link.
      </p>
    </main>
  );
}
