import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { SwitchesView } from "@/features/mcp";
import { BrandSwitches } from "@/features/staff";
import { EmailDefaultSwitch } from "@/features/alerts";

export const metadata = { title: "Switches" };

export default function Page(props: PageProps<"/admin/switches">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Switches</h1>
        <p className="text-ink-2">Turn features on for everyone, or for one business.</p>
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <SwitchesView searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<div className="skeleton h-40" />}>
        <BrandSwitches switchKey="phone" />
      </Suspense>
      <Suspense fallback={<div className="skeleton h-40" />}>
        <BrandSwitches switchKey="messaging" />
      </Suspense>
      <Suspense fallback={<div className="skeleton h-40" />}>
        <EmailDefaultSwitch />
      </Suspense>
    </main>
  );
}
