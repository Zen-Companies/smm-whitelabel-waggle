import { Suspense } from "react";
import { LeadsList } from "@/features/leads";

export const metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Leads</h1>
        <p className="text-gray-700">People who asked to book, order or get a quote.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <LeadsList />
      </Suspense>
    </main>
  );
}
