import { Suspense } from "react";
import { ContactsTabs } from "@/features/contacts";
import { LeadsBoard } from "@/features/leads";

export const metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-6 md:px-8">
      <ContactsTabs active="/leads" />
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <LeadsBoard />
      </Suspense>
    </main>
  );
}
