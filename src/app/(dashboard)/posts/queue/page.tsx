import { Suspense } from "react";
import { QueueView } from "@/features/publishing";

export const metadata = { title: "Posting times" };

export default function QueuePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <QueueView />
      </Suspense>
    </main>
  );
}
