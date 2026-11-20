"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updatePlatformStatuses, type PlatformsFormState } from "./actions";
import { STATUS_LABELS, type PlatformStatus, type SwitchablePlatform } from "./catalog";

export interface PlatformFormRow {
  id: string;
  label: string;
  group: SwitchablePlatform["group"];
  status: PlatformStatus;
  allowed: PlatformStatus[];
  blocked: string | null;
  signin: "welcome" | "platform" | null;
  usageAtCost: boolean;
  connected: number | null;
}

const ALL: PlatformStatus[] = ["hidden", "soon", "available"];

export function PlatformsForm({ rows }: { rows: PlatformFormRow[] }) {
  const [state, action, pending] = useActionState<PlatformsFormState, FormData>(
    updatePlatformStatuses,
    {},
  );
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <form action={action} className="flex flex-col gap-5">
      <p className="meta">
        Hidden: not shown. Coming soon: shown, can&apos;t connect. Available: owners can connect.
        Anyone already connected keeps working.
      </p>
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2">
          <h2 className="text-ink-2 text-sm font-semibold">{g}</h2>
          <ul className="card divide-line flex flex-col divide-y">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="flex min-w-[200px] flex-1 flex-col">
                    <b className="font-semibold">{r.label}</b>
                    <span className="text-ink-2 text-[13px]">
                      {r.blocked ??
                        (r.signin === "welcome"
                          ? "Sign-in shows Waggle's welcome page"
                          : r.signin === "platform"
                            ? "Sign-in shows our provider's name first"
                            : "Sign-in not seen yet")}
                      {r.usageAtCost && " · Usage charged at cost"}
                      {r.connected !== null && ` · ${r.connected} connected`}
                    </span>
                  </span>
                  <fieldset className="flex flex-col gap-1">
                    <legend className="sr-only">What owners see for {r.label}</legend>
                    <span className="border-line inline-flex overflow-hidden rounded-[10px] border">
                      {ALL.map((s) => {
                        const ok = r.allowed.includes(s);
                        return (
                          <label
                            key={s}
                            className={cn(
                              "border-line has-[:checked]:bg-ink has-[:checked]:text-surface flex min-h-9 cursor-pointer items-center border-l px-3 text-[13px] font-medium first:border-l-0 has-[:focus-visible]:outline-2",
                              !ok && "text-ink-3 cursor-not-allowed",
                            )}
                          >
                            <input
                              type="radio"
                              name={r.id}
                              value={s}
                              defaultChecked={r.status === s}
                              disabled={!ok}
                              className="sr-only"
                            />
                            {STATUS_LABELS[s]}
                          </label>
                        );
                      })}
                    </span>
                  </fieldset>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved && (
          <span className="text-success inline-flex items-center gap-1.5 text-sm">
            <Check className="size-4" aria-hidden /> {state.saved}
          </span>
        )}
        {state.error && <p className="danger-box">{state.error}</p>}
      </div>
    </form>
  );
}
