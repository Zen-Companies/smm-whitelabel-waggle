import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { CustomersList } from "@/features/customers";

export const metadata = { title: "Customers" };

export default function Page(props: PageProps<"/admin/customers">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Customers</h1>
        <p className="text-ink-2">
          Every business that signed up, and every sign-up with no business yet, where they are and
          what went wrong. Open one to trace it.
        </p>
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <CustomersList searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
