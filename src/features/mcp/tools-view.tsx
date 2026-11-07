import Link from "next/link";
import { Chip } from "@/components/app/chip";
import { requirePermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { cn } from "cn";
import { loadPlaygroundTargets } from "./admin";
import { sampleInput, toolDoc, type FieldDoc } from "./docs";
import { TOOLS, toolByName } from "./tools/registry";
import { TryIt } from "./try-it";

// Staff "MCP tools" (design v3): every tool from the registry, its description for the AI, input
// and result, and "Try it" for roles allowed to run it.

function FieldTable({ fields, caption }: { fields: FieldDoc[]; caption: string }) {
  if (!fields.length) return <p className="meta">No fields.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="meta text-left text-xs">
          <tr className="border-line border-b">
            <th scope="col" className="px-2.5 py-2 font-medium">
              Field
            </th>
            <th scope="col" className="px-2.5 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="px-2.5 py-2 font-medium">
              <span className="sr-only">Required</span>
            </th>
            <th scope="col" className="px-2.5 py-2 font-medium">
              What it is
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name} className="border-subtle border-b align-top last:border-0">
              <td className="px-2.5 py-2 font-mono text-xs">{f.name}</td>
              <td className="text-ink-2 px-2.5 py-2 font-mono text-xs break-words">{f.type}</td>
              <td className="px-2.5 py-2">
                <Chip>{f.required ? "required" : "optional"}</Chip>
              </td>
              <td className="text-ink-2 px-2.5 py-2">{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function McpToolsView({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string | string[] }>;
}) {
  const access = await requirePermission("mcp.docs.view");
  const sp = await searchParams;
  const asked = Array.isArray(sp.tool) ? sp.tool[0] : sp.tool;
  const tool = (asked && toolByName(asked)) || TOOLS[0];
  const doc = toolDoc(tool);
  const canRun = access.permissions.has("mcp.playground.run");
  const targets = canRun ? await loadPlaygroundTargets(getServiceClient()) : [];
  const groups = [
    { label: "Read", tools: TOOLS.filter((t) => t.access === "read") },
    { label: "Act", tools: TOOLS.filter((t) => t.access === "act") },
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_380px]">
      <nav aria-label="Tools" className="card flex flex-col gap-0.5 p-1.5">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <span className="text-ink-3 px-2.5 pt-2.5 pb-1 text-xs font-semibold tracking-wide uppercase">
              {g.label}
            </span>
            {g.tools.map((t) => {
              const on = t.name === tool.name;
              return (
                <Link
                  key={t.name}
                  href={`/admin/mcp-tools?tool=${t.name}`}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex flex-col rounded-md px-2.5 py-1.5",
                    on ? "bg-subtle text-ink" : "text-ink-2 hover:bg-subtle",
                  )}
                >
                  <span className={cn("font-mono text-xs", on && "font-semibold")}>{t.name}</span>
                  <span className="text-ink-3 text-xs">{t.title}</span>
                </Link>
              );
            })}
          </div>
        ))}
        <a
          href="/admin/mcp-tools/openapi.json"
          className="text-honey-text mx-2.5 mt-2.5 mb-1.5 text-[13px] underline-offset-4 hover:underline"
        >
          OpenAPI spec (JSON)
        </a>
      </nav>

      <article className="flex min-w-0 flex-col gap-4.5">
        <div className="flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-xl font-medium">{doc.name}</h2>
            {doc.traits.map((t) => (
              <Chip key={t.label} tone={t.tone}>
                {t.label}
              </Chip>
            ))}
          </span>
          <span className="text-ink-2 text-sm">
            Title shown in Claude and ChatGPT: <b className="text-ink font-semibold">{doc.title}</b>{" "}
            · Needs: <span className="font-mono text-xs">{doc.access}</span> on the brand
            {doc.kind === "send" && " · counts toward the send limits"} · Wraps{" "}
            <span className="font-mono text-xs">{doc.wraps}</span>
          </span>
        </div>
        <section className="flex flex-col gap-1.5" aria-labelledby="desc">
          <h3 id="desc" className="font-semibold">
            Description the AI reads
          </h3>
          <p className="border-line bg-subtle text-ink-2 rounded-[10px] border px-3.5 py-3 text-sm">
            {doc.description}
          </p>
        </section>
        <section className="flex flex-col gap-1.5" aria-labelledby="input">
          <h3 id="input" className="font-semibold">
            Input
          </h3>
          <FieldTable fields={doc.input} caption={`${doc.name} input`} />
        </section>
        <section className="flex flex-col gap-1.5" aria-labelledby="returns">
          <h3 id="returns" className="font-semibold">
            Returns
          </h3>
          <FieldTable fields={doc.output} caption={`${doc.name} result`} />
          <span className="meta">Errors: {doc.errors.join(" · ")} · internal</span>
        </section>
      </article>

      {canRun && (
        <div className="lg:col-span-2 xl:col-span-1">
          <TryIt key={tool.name} tool={tool.name} sample={sampleInput(doc)} targets={targets} />
        </div>
      )}
    </div>
  );
}
