"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessName, type NameState } from "./actions";
import { nameButtonLabel, prefillValue } from "./brand-name";
import { PRIMARY, ScreenFooter, ScreenTitle } from "./setup-frame";

/** While the AI profile is on its way: look again this often, for this long. */
const POLL_MS = 3_000;
const POLL_FOR_MS = 20_000;

/**
 * Decision 6, approved 24 Nov: the page had no exact name, so ask once, at the start of step 2,
 * prefilled with the best guess (the AI profile's suggestion, else the profile's display name).
 * Never an empty box when there is a guess. While the AI profile isn't made yet, the page looks
 * again briefly and fills the field with a newer guess only if the owner hasn't typed.
 */
export function NameScreen({
  guess,
  waiting,
  count,
}: {
  guess: string;
  /** The AI profile isn't made yet: its suggestion may still come. */
  waiting: boolean;
  count: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<NameState, FormData>(saveBusinessName, {});
  const [value, setValue] = useState(guess);
  const [typed, setTyped] = useState(false);
  const [shownGuess, setShownGuess] = useState(guess);
  // A newer guess came in with a refresh: fill it only if the owner hasn't typed.
  if (guess !== shownGuess) {
    setShownGuess(guess);
    setValue(prefillValue({ typed, current: value, guess }));
  }

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) window.clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, router]);

  const hasGuess = guess !== "";
  return (
    <form action={action} className="contents">
      <ScreenTitle
        title={hasGuess ? "Is this your business name?" : "What’s your business called?"}
        sub="Waggle answers your customers as this business."
      />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Business name
        <input
          name="name"
          required
          maxLength={80}
          autoFocus={!hasGuess}
          value={value}
          onChange={(e) => {
            setTyped(true);
            setValue(e.target.value);
          }}
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
            {pending ? "Saving…" : nameButtonLabel({ value, guess })}
          </button>
        }
      />
    </form>
  );
}
