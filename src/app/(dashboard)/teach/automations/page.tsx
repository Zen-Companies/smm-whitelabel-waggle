import { Suspense } from "react";
import { AutomationsView } from "@/features/automations";
import { ReadyLine } from "@/features/setup";

export const metadata = { title: "Automations" };

/** Teach Waggle → Automations, on its first kind (Comment to DM). */
export default function AutomationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <AutomationsView top={<ReadyLine />} />
      </Suspense>
    </main>
  );
}
