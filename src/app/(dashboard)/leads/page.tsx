import { Suspense } from "react";
import { LeadsList } from "@/features/leads";

export default function LeadsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-muted-foreground text-sm">
          People who asked to book, order or get a quote. You also get an email for each one.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <LeadsList />
      </Suspense>
    </main>
  );
}
