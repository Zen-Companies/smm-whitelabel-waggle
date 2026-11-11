import { Suspense } from "react";
import { RequestsView } from "@/features/feedback";

export const metadata = { title: "Your requests" };

// Your requests (design v3 "Beta access and feedback"): reached from the Feedback panel.
export default function RequestsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[820px] flex-col gap-4 px-4 py-8 md:px-8">
      <h1 className="page-title">Your requests</h1>
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <RequestsView />
      </Suspense>
    </main>
  );
}
