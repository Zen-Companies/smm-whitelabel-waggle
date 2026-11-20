import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { StaffView } from "@/features/staff";

export const metadata = { title: "Staff" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Staff</h1>
        <p className="text-ink-2">
          Who at Zen Companies can open these staff pages, and what they can do.
        </p>
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <StaffView />
      </Suspense>
    </main>
  );
}
