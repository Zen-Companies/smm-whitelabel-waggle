import { Suspense } from "react";
import { SwitchesView } from "@/features/mcp";

export const metadata = { title: "Feature switches" };

export default function Page(props: PageProps<"/admin/switches">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Feature switches</h1>
        <p className="text-ink-2">
          Turn AI assistants on for everyone or brand by brand, while billing tiers are decided.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-96" />}>
        <SwitchesView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
