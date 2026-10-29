import { Suspense } from "react";
import { KbList } from "@/features/knowledge-base";

export const metadata = { title: "Business info" };

export default function KnowledgeBasePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Business info</h1>
        <p className="text-gray-700">
          The only facts the receptionist uses in replies: hours, location, prices, services,
          policies. If something isn&apos;t here, it asks you instead of guessing.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <KbList />
      </Suspense>
    </main>
  );
}
