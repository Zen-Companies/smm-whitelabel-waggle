import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { ContactsTabs } from "@/features/contacts";
import { LeadsBoard } from "@/features/leads";

export const metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      {/* The same title and tabs as People, Ad leads and Broadcasts; only the board is wider. */}
      <div className="flex max-w-[960px] flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">Contacts</h1>
          <p className="text-ink-2">
            Everyone who asked to book, buy or sell. Each one is also emailed to you.
          </p>
        </div>
        <ContactsTabs active="/contacts/leads" />
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.contacts} />}>
        <LeadsBoard />
      </Suspense>
    </main>
  );
}
