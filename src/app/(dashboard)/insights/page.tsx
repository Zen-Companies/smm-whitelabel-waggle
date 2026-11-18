import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { AnalyticsView } from "@/features/analytics";

export const metadata = { title: "Insights" };

/** Insights → Overview. The other sections live at /insights/<section>. */
export default function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.insights} />}>
        <AnalyticsView searchParams={searchParams} section="overview" />
      </Suspense>
    </main>
  );
}
