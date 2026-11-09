import { Suspense } from "react";
import { BrandsView } from "@/features/offboarding";

export const metadata = { title: "Brands" };

export default function Page(props: PageProps<"/admin/brands">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Brands</h1>
        <p className="text-ink-2">
          Offboard a brand that is leaving Waggle, or bring one back within 3 months.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-96" />}>
        <BrandsView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
