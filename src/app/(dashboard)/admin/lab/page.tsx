import { Suspense } from "react";
import { LabView } from "@/features/lab";

export const metadata = { title: "Lab" };

export default function LabPage(props: PageProps<"/admin/lab">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Lab</h1>
        <p className="text-ink-2">
          Operator view: run one message through two setups and compare what would happen.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-96" />}>
        <LabView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
