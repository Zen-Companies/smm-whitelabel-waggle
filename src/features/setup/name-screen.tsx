"use client";

import { useActionState } from "react";
import { saveBusinessName, type NameState } from "./actions";
import { PRIMARY, ScreenFooter, ScreenTitle } from "./setup-frame";

/** Decision 6: the connected profile had no business name, so ask once, at the start of step 2. */
export function NameScreen({ platform, count }: { platform: string; count: number }) {
  const [state, action, pending] = useActionState<NameState, FormData>(saveBusinessName, {});
  return (
    <form action={action} className="contents">
      <ScreenTitle
        title="What’s your business called?"
        sub={`Your ${platform} profile didn’t say. Waggle answers your customers as this business.`}
      />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Business name
        <input
          name="name"
          required
          maxLength={80}
          autoFocus
          defaultValue={state.name ?? ""}
          autoComplete="organization"
          className="field font-normal"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "name-error" : undefined}
        />
      </label>
      {state.error && (
        <p id="name-error" role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      <p className="text-ink-3 text-sm">Waggle is reading your inbox meanwhile.</p>
      <ScreenFooter
        back={null}
        index={1}
        count={count}
        primary={
          <button type="submit" className={PRIMARY} disabled={pending}>
            {pending ? "Saving…" : "Next"}
          </button>
        }
      />
    </form>
  );
}
