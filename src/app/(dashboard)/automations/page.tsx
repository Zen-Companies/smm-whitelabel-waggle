import { Suspense } from "react";
import { AutomationsView } from "@/features/automations";

export const metadata = { title: "Automations" };

export default function AutomationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <AutomationsView />
      </Suspense>
    </main>
  );
}
