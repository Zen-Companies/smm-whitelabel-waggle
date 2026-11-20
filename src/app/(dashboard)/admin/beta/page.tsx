import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { BetaCodesView } from "@/features/beta";

export const metadata = { title: "Beta codes" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Beta codes</h1>
        <p className="text-ink-2">Codes that let people sign up while the beta is invite-only.</p>
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <BetaCodesView />
      </Suspense>
    </main>
  );
}
