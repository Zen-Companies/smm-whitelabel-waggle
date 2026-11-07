import { Suspense } from "react";
import { McpToolsView } from "@/features/mcp";

export const metadata = { title: "MCP tools" };

export default function Page(props: PageProps<"/admin/mcp-tools">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">MCP tools</h1>
        <p className="text-ink-2">
          Every tool an AI assistant (Claude, ChatGPT, Grok) can call, generated from the tool
          registry so it always matches what&apos;s live.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-96" />}>
        <McpToolsView searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
