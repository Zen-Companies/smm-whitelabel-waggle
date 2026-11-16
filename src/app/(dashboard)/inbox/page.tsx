import { Suspense } from "react";
import { InboxSkeleton, InboxView } from "@/features/approvals";

export const metadata = { title: "Inbox" };

// Plain props type: the generated route types need `next typegen`.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Inbox → For you. */
export default function InboxPage({ searchParams }: Props) {
  return (
    <main
      data-fit-screen
      className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8 lg:min-h-0 lg:flex-1"
    >
      <Suspense fallback={<InboxSkeleton />}>
        <InboxView tab="for_you" searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
