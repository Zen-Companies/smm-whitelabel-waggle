import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { PostsView } from "@/features/publishing";

export const metadata = { title: "Posts" };

export default function PostsPage({ searchParams }: PageProps<"/posts">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.posts} />}>
        <PostsView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
