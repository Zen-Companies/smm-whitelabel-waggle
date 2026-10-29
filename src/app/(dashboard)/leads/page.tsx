import { Suspense } from "react";
import { LeadsList } from "@/features/leads";

export const metadata = { title: "Leads" };

export default function LeadsPage({ searchParams }: PageProps<"/leads">) {
  return (
    <main className="flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <LeadsList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
