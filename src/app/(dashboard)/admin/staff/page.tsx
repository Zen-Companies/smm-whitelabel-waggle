import { Suspense } from "react";
import { StaffView } from "@/features/staff";

export const metadata = { title: "Staff and roles" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Staff and roles</h1>
        <p className="text-ink-2">
          Who at Zen Companies can open these staff pages, and what they can do.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-72" />}>
        <StaffView />
      </Suspense>
    </main>
  );
}
