import { Suspense } from "react";
import { ShopPage } from "@/features/shop";

export const metadata = { title: "Shop" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<div className="skeleton h-[600px] rounded-xl" />}>
        <ShopPage site={pick(params.site)} tab={pick(params.tab)} />
      </Suspense>
    </main>
  );
}
