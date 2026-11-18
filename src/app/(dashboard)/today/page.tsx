import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { TodayView } from "@/features/today";
import { PlanNote } from "../plan-note";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <Suspense fallback={null}>
        <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 empty:hidden md:px-6">
          <PlanNote where="today" />
        </div>
      </Suspense>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.today} />}>
        <TodayView />
      </Suspense>
    </>
  );
}
