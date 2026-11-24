import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { CustomerDetailView } from "@/features/customers";

export const metadata = { title: "Customer" };

export default function Page(props: PageProps<"/admin/customers/[tenantId]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <CustomerDetailView params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
