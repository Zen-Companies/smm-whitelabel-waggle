import { Suspense } from "react";
import { AnalyticsView } from "@/features/analytics";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[600px] rounded-xl" />}>
        <AnalyticsView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
