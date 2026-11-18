import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { AutomationsView } from "@/features/automations";
import { ReadyLine } from "@/features/setup";

export const metadata = { title: "Automations" };

/** Teach Waggle → Automations, on its first kind (Comment to DM). */
export default function AutomationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.teach} />}>
        <AutomationsView top={<ReadyLine />} />
      </Suspense>
    </main>
  );
}
