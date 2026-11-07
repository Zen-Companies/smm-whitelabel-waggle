"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { disconnectAssistant, updateGrantBrands, type GrantFormState } from "./actions";

export interface AssistantRowProps {
  clientId: string;
  clientName: string;
  connectedOn: string;
  /** `on`: AI assistants switched on for the brand (staff switch). */
  brands: { id: string; name: string; shared: boolean; on: boolean }[];
}

/**
 * One connected assistant (design v3 "AI assistants · Settings"): its brands, "Change brands" in
 * place, and "Disconnect" with an inline confirmation (no dialogs or toasts, design.md §4).
 */
export function AssistantRow({ clientId, clientName, connectedOn, brands }: AssistantRowProps) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [state, action, pending] = useActionState<GrantFormState, FormData>(
    async (prev, formData) => {
      const next = await updateGrantBrands(prev, formData);
      if (next.saved) setMode("view");
      return next;
    },
    {},
  );
  const shared = brands.filter((b) => b.shared);

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <span
        aria-hidden
        className="border-line bg-subtle flex size-10 items-center justify-center rounded-xl border font-bold"
      >
        {clientName.slice(0, 1).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span>
          <b className="font-semibold">{clientName}</b>{" "}
          <span className="meta">· connected {connectedOn}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-2 text-sm">Brands:</span>
          {shared.length ? (
            shared.map((b) => (
              <span
                key={b.id}
                className="bg-subtle text-ink-2 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                {b.name}
              </span>
            ))
          ) : (
            <span className="text-ink-3 text-sm">none</span>
          )}
        </span>
        {state.saved && mode === "view" && (
          <span className="text-success text-sm">Brands saved.</span>
        )}
      </div>
      {mode === "view" && (
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
          <Button type="button" size="sm" onClick={() => setMode("edit")}>
            Change brands
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => setMode("confirm")}>
            Disconnect
          </Button>
        </div>
      )}

      {mode === "edit" && (
        <form action={action} className="col-span-full flex flex-col gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Brands {clientName} can use</legend>
            {brands.map((b) => (
              <label
                key={b.id}
                className="flex min-h-11 items-center gap-3 has-[:disabled]:opacity-60"
              >
                <input
                  type="checkbox"
                  name="brands"
                  value={b.id}
                  defaultChecked={b.shared}
                  disabled={!b.on && !b.shared}
                  className="accent-honey size-5"
                />
                <span className="flex flex-col">
                  {b.name}
                  {!b.on && (
                    <span className="text-ink-3 text-sm">
                      AI assistants aren&apos;t turned on for this brand yet.
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save brands"}
            </Button>
            <Button type="button" variant="quiet" size="sm" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === "confirm" && (
        <form
          action={disconnectAssistant}
          role="alertdialog"
          aria-label={`Disconnect ${clientName}`}
          className="border-danger-border bg-danger-soft col-span-full flex flex-wrap items-center gap-3 rounded-[10px] border px-3.5 py-3"
        >
          <input type="hidden" name="clientId" value={clientId} />
          <span className="min-w-0 flex-[1_1_320px]">
            Disconnect {clientName}? It loses access to every brand right away. Replies and posts it
            already sent stay sent.
          </span>
          <span className="flex gap-2">
            <Button type="submit" size="sm" variant="destructive">
              Disconnect
            </Button>
            <Button type="button" size="sm" onClick={() => setMode("view")}>
              Keep it
            </Button>
          </span>
        </form>
      )}
    </li>
  );
}
