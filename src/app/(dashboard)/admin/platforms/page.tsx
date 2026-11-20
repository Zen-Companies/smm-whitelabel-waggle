import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { PlatformsView } from "@/features/platforms";

export const metadata = { title: "Platforms" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Platforms</h1>
        <p className="text-ink-2">
          What owners see for each platform. Applies to every business at once.
        </p>
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <PlatformsView />
      </Suspense>
    </main>
  );
}
