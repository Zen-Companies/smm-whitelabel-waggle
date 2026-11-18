import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalyticsView } from "@/features/analytics";
import { isInsightsSection } from "@/lib/routes";

export const metadata = { title: "Insights" };

// Plain props type: the generated route types need `next typegen`.
type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function View({ params, searchParams }: Props) {
  const { section } = await params;
  if (!isInsightsSection(section)) notFound();
  return <AnalyticsView searchParams={searchParams} section={section} />;
}

/** /insights/work, /insights/posts, /insights/audience (the Overview is /insights). */
export default function InsightsSectionPage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.insights} />}>
        <View {...props} />
      </Suspense>
    </main>
  );
}
