import { Suspense } from "react";
import { OwnerLab } from "@/features/lab";

export const metadata = { title: "Lab" };

/** The owner's Lab (T35, T36): check the receptionist before it replies on its own. */
export default function LabPage() {
  return (
    <main className="flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">Lab</h1>
          <p className="text-gray-700">Check your receptionist before it replies on its own.</p>
        </div>
        <span className="flex min-h-9 items-center rounded-full bg-gray-50 px-3.5 text-sm text-gray-700">
          Practice only: nothing is posted
        </span>
      </header>
      <Suspense fallback={<div className="skeleton h-96" />}>
        <OwnerLab />
      </Suspense>
    </main>
  );
}
