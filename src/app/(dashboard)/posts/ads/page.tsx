import { Suspense } from "react";
import { AdsView } from "@/features/ads";

export const metadata = { title: "Ads" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdsPage({ searchParams }: Props) {
  const params = await searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <AdsView
          adsError={pick(params.ads_error)}
          justConnected={
            pick(params.ads) === "connected" ? (pick(params.network) ?? "meta") : undefined
          }
        />
      </Suspense>
    </main>
  );
}
