import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { ConsentScreen } from "@/features/mcp";

export const metadata = { title: "Connect an AI assistant", robots: { index: false } };

async function Body({ searchParams }: PageProps<"/oauth/consent">) {
  const params = await searchParams;
  const id = typeof params.authorization_id === "string" ? params.authorization_id : null;
  return <ConsentScreen authorizationId={id} />;
}

// MCP Phase 2 (docs/mcp/PLAN.md §4.2): Supabase's OAuth server sends the user here to pick the
// brands an AI assistant may use. Outside the dashboard: no brand menu or navigation.
export default function ConsentPage(props: PageProps<"/oauth/consent">) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-4 py-10 md:py-14">
      <Brand />
      <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
        <Body {...props} />
      </Suspense>
    </main>
  );
}
