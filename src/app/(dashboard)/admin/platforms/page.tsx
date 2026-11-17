import { Suspense } from "react";
import { PlatformsView } from "@/features/platforms";

export const metadata = { title: "Platforms" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Platforms</h1>
        <p className="text-ink-2 max-w-[760px]">
          What owners see for each platform. Hidden: not shown anywhere. Coming soon: shown,
          can&apos;t connect. Available: owners can connect it. Applies to every business at once;
          anyone already connected keeps working whatever you pick.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-64" />}>
        <PlatformsView />
      </Suspense>
    </main>
  );
}
