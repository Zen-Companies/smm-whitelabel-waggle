import { Suspense } from "react";
import { McpActivityView } from "@/features/mcp";

export const metadata = { title: "MCP activity" };

export default function Page(props: PageProps<"/admin/mcp-activity">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">MCP activity</h1>
        <p className="text-ink-2">Every call AI assistants made to Waggle, newest first.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-96" />}>
        <McpActivityView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
