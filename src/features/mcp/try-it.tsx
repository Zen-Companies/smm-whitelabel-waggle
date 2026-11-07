"use client";

import { useActionState, useState } from "react";
import { Chip } from "@/components/app/chip";
import { Button } from "@/components/ui/button";
import { runTryIt, type PlaygroundState } from "./admin-actions";
import type { PlaygroundTarget } from "./admin";

/**
 * "Try it" (design v3 "MCP tools"): run the tool as a test brand's owner, through the same code
 * path as a real AI assistant. The brand is always the one picked here.
 */
export function TryIt({
  tool,
  sample,
  targets,
}: {
  tool: string;
  sample: string;
  targets: PlaygroundTarget[];
}) {
  const [userId, setUserId] = useState(targets[0]?.userId ?? "");
  const brands = targets.find((t) => t.userId === userId)?.brands ?? [];
  const [tenantId, setTenantId] = useState(brands[0]?.id ?? "");
  const [state, action, pending] = useActionState<PlaygroundState, FormData>(runTryIt, {});
  const brand = brands.find((b) => b.id === tenantId);
  const result = state.result;

  return (
    <aside aria-labelledby="try-it" className="card flex flex-col gap-3.5 p-4.5">
      <span className="flex items-center justify-between gap-2">
        <h2 id="try-it" className="font-semibold">
          Try it
        </h2>
        <Chip tone="blue">Logged as a playground run</Chip>
      </span>
      {!targets.length ? (
        <p className="text-ink-2 text-sm">
          No test brands yet. Mark one with{" "}
          <code className="font-mono text-xs">update tenants set is_test = true</code> in the SQL
          editor (locally, <code className="font-mono text-xs">pnpm demo:seed</code> does it).
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3.5">
          <input type="hidden" name="tool" value={tool} />
          <span className="flex flex-col gap-1.5">
            <label htmlFor="try-user" className="text-[13px] font-semibold">
              Run as
            </label>
            <select
              id="try-user"
              name="userId"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                const next = targets.find((t) => t.userId === e.target.value);
                setTenantId(next?.brands[0]?.id ?? "");
              }}
              className="field"
            >
              {targets.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {t.email}
                </option>
              ))}
            </select>
          </span>
          <span className="flex flex-col gap-1.5">
            <label htmlFor="try-brand" className="text-[13px] font-semibold">
              Brand
            </label>
            <select
              id="try-brand"
              name="tenantId"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="field"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (test)
                </option>
              ))}
            </select>
            {brand && !brand.on && (
              <span className="text-honey-text text-xs">
                AI assistants are off for this brand, so tools will refuse it. Turn it on in
                Switches.
              </span>
            )}
          </span>
          <span className="flex flex-col gap-1.5">
            <label htmlFor="try-input" className="text-[13px] font-semibold">
              Input
            </label>
            <textarea
              id="try-input"
              name="input"
              rows={6}
              defaultValue={sample}
              spellCheck={false}
              className="field resize-y font-mono text-xs"
            />
            <span className="meta text-xs">JSON. brand_id is set to the brand above.</span>
          </span>
          <span className="flex flex-wrap items-center gap-2.5">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Running…" : "Run"}
            </Button>
            <span className="meta text-xs">
              Same code path as a real AI assistant. Test brands only.
            </span>
          </span>
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
          {result && !pending && (
            <div role="status" className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[13px]">
                <b className="font-semibold">Response</b>
                {result.ok ? <Chip tone="green">ok</Chip> : <Chip tone="red">{result.code}</Chip>}
                <span className="meta">{result.ms} ms</span>
              </span>
              <pre className="bg-ink text-surface max-h-96 overflow-auto rounded-[10px] px-3.5 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {result.body}
              </pre>
            </div>
          )}
        </form>
      )}
    </aside>
  );
}
