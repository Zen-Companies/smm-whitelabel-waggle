import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { SignupDetailView } from "@/features/customers";

export const metadata = { title: "Sign-up" };

/** Staff → Customers, a sign-up with no business yet (the business page is /admin/customers/[tenantId]). */
export default function Page(props: PageProps<"/admin/customers/user/[userId]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <SignupDetailView params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
