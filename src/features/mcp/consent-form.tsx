"use client";

import { Eye, Send, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { approveConnection, denyConnection, type ConsentState } from "./actions";

export interface ConsentBrand {
  id: string;
  name: string;
  accounts: string;
  checked: boolean;
  disabled: boolean;
}

/**
 * The consent form (design v3 "AI assistants · Connect"): which brands the assistant may use,
 * what it can do, and Waggle's limits. Errors stay under the brands; no toasts (design.md §4).
 */
export function ConsentForm({
  authorizationId,
  assistant,
  brands,
}: {
  authorizationId: string;
  assistant: string;
  brands: ConsentBrand[];
}) {
  const [state, action, pending] = useActionState<ConsentState, FormData>(approveConnection, {});
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6">
        <input type="hidden" name="authorizationId" value={authorizationId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Which brands can {assistant} use?</legend>
          {brands.map((b) => (
            <label
              key={b.id}
              className="border-line has-[:checked]:border-honey flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
            >
              <input
                type="checkbox"
                name="brands"
                value={b.id}
                defaultChecked={b.checked}
                disabled={b.disabled}
                className="accent-honey mt-0.5 size-5 shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <b className="font-semibold">{b.name}</b>
                <span className="text-ink-3 text-sm">{b.accounts}</span>
              </span>
            </label>
          ))}
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
        </fieldset>

        <section
          aria-label={`What ${assistant} can do`}
          className="border-line bg-subtle/60 flex flex-col gap-3 rounded-xl border p-4"
        >
          <p className="flex gap-2.5">
            <Eye className="text-ink-2 mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>
              <b className="font-semibold">Read</b>{" "}
              <span className="text-ink-2">your inbox, posts, analytics and business info.</span>
            </span>
          </p>
          <p className="flex gap-2.5">
            <Send className="text-ink-2 mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>
              <b className="font-semibold">Act for you</b>{" "}
              <span className="text-ink-2">
                send replies, publish and schedule posts, hide comments. {assistant} asks you before
                each one.
              </span>
            </span>
          </p>
          <p className="flex gap-2.5">
            <ShieldCheck
              className="text-ink-2 mt-0.5 size-[18px] shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="text-ink-2">
              Waggle&apos;s rules still apply: every reply can be undone for 8 seconds, and AI
              assistants can send at most 10 replies and posts every 10 minutes, and 100 a day, per
              brand.
            </span>
          </p>
        </section>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={pending}
              data-busy={pending || undefined}
            >
              {pending ? "Connecting…" : "Allow"}
            </Button>
            <Button type="submit" variant="quiet" formAction={denyConnection} formNoValidate>
              Cancel
            </Button>
          </div>
          <p className="text-ink-3 text-sm">
            Only allow assistants you trust: {assistant} will see your customers&apos; messages as
            they wrote them. You can change the brands or disconnect anytime in Settings → AI
            assistants.
          </p>
        </div>
      </form>
    </div>
  );
}
