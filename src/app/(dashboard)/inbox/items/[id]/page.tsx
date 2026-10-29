import { Suspense } from "react";
import { ItemDetail } from "@/features/approvals";

export const metadata = { title: "Conversation" };

export default function InboxItemPage({ params }: PageProps<"/inbox/items/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
        <ItemDetail params={params} />
      </Suspense>
    </main>
  );
}
