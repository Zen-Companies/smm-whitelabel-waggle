import { Suspense } from "react";
import { Bee } from "@/components/app/bee";
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
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[1320px] px-4 py-9 md:px-6">
            <div className="flex min-h-[420px] items-center justify-center">
              <Bee scene="loading" />
            </div>
          </div>
        }
      >
        <TodayView />
      </Suspense>
    </>
  );
}
