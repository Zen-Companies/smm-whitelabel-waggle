import { Suspense } from "react";
import { TodayView } from "@/features/today";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1320px] px-4 py-9 md:px-6">
          <div className="skeleton h-[560px] rounded-xl" />
        </div>
      }
    >
      <TodayView />
    </Suspense>
  );
}
