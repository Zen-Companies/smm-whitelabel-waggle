import { Suspense } from "react";
import { KbList } from "@/features/knowledge-base";

export default function KnowledgeBasePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Knowledge base</h1>
        <p className="text-muted-foreground text-sm">
          The only facts the receptionist may use in replies: hours, location, prices, services,
          policies. If something isn&apos;t here, it asks you instead of guessing.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <KbList />
      </Suspense>
    </main>
  );
}
