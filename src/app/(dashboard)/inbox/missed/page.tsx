import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { MissedList } from "@/features/catch-up";

export const metadata = { title: "Too old to answer" };

/** Inbox → DMs from before Waggle was connected that are too old to answer (read only). */
export default function InboxMissedPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.inbox} />}>
        <MissedList />
      </Suspense>
    </main>
  );
}
