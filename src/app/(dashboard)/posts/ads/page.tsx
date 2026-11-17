import { Suspense } from "react";
import { AdsView } from "@/features/ads";

export const metadata = { title: "Ads" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// The address is read inside Suspense, so the page shell can prerender (Cache Components).
async function Ads({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <AdsView
      adsError={pick(params.ads_error)}
      justConnected={
        pick(params.ads) === "connected" ? (pick(params.network) ?? "meta") : undefined
      }
    />
  );
}

export default function AdsPage({ searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[480px] rounded-xl" />}>
        <Ads searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
