import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { BlogPage } from "@/features/blog";

export const metadata = { title: "Blog" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// The address is read inside Suspense, so the page shell can prerender (Cache Components).
async function Blog({ searchParams }: Props) {
  const params = await searchParams;
  return <BlogPage site={pick(params.site)} blog={pick(params.blog)} />;
}

export default function Page({ searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.posts} />}>
        <Blog searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
