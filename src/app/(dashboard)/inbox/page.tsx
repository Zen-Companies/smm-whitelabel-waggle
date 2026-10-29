import { Suspense } from "react";
import { InboxList } from "@/features/approvals";

export default function InboxPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-muted-foreground text-sm">
          Replies the receptionist drafted, waiting for your OK, and messages it handed to you.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
        <InboxList />
      </Suspense>
    </main>
  );
}
