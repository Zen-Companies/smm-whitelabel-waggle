import { Suspense } from "react";
import { InboxSkeleton, InboxView } from "@/features/approvals";

export const metadata = { title: "Inbox" };

export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Inbox</h1>
        <p className="text-gray-700">Replies ready for your OK, and messages that need you.</p>
      </div>
      <Suspense fallback={<InboxSkeleton />}>
        <InboxView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
