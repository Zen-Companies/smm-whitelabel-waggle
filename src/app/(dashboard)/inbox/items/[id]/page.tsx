import { Suspense } from "react";
import { ItemDetail } from "@/features/approvals";

export default function InboxItemPage({ params }: PageProps<"/inbox/items/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Message</h1>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <ItemDetail params={params} />
      </Suspense>
    </main>
  );
}
