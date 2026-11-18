import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { BroadcastsView } from "@/features/contacts";

export const metadata = { title: "Broadcasts" };

export default function BroadcastsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.contacts} />}>
        <BroadcastsView />
      </Suspense>
    </main>
  );
}
