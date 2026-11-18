import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { AdLeadsView } from "@/features/contacts";

export const metadata = { title: "Ad leads" };

export default function AdLeadsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.contacts} />}>
        <AdLeadsView />
      </Suspense>
    </main>
  );
}
