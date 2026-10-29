import { Suspense } from "react";
import { ComposeCard, PostsList } from "@/features/publishing";

export const metadata = { title: "Posts" };

export default function PostsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Posts</h1>
        <p className="text-gray-600">Share news with your customers, now or later.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-72" />}>
        <ComposeCard />
        <PostsList />
      </Suspense>
    </main>
  );
}
