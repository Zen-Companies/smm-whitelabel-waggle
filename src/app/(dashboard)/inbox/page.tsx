import { Suspense } from "react";
import { InboxSkeleton, InboxView } from "@/features/approvals";

export const metadata = { title: "Inbox" };

export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <main className="flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<InboxSkeleton />}>
        <InboxView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
