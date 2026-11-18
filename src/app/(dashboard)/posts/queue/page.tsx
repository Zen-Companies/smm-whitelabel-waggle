import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { QueueView } from "@/features/publishing";

export const metadata = { title: "Posting times" };

export default function QueuePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.posts} />}>
        <QueueView />
      </Suspense>
    </main>
  );
}
