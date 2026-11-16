"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  connectEmailAction,
  connectLineAction,
  discoverEmailAction,
  type EmailStep,
  type OwnKeyState,
} from "./own-key-actions";

/**
 * Connect another email (design "Connect another email"): the address first, then the
 * provider's own steps and the password field. Waggle's own form; no hosted page.
 */
export function EmailConnectForm() {
  const [step, find, finding] = useActionState<EmailStep, FormData>(discoverEmailAction, {});
  const [state, connect, connecting] = useActionState<OwnKeyState, FormData>(
    connectEmailAction,
    {},
  );
  const d = step.discovery;

  if (state.done) {
    return (
      <p role="status" className="text-success pt-3 text-sm font-medium">
        {state.done}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 pt-3">
      <form action={find} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Email address
          <input
            name="email"
            type="email"
            autoComplete="off"
            defaultValue={step.email}
            className="field"
            required
          />
        </label>
        <Button type="submit" variant="secondary" disabled={finding}>
          {finding ? "Looking it up…" : "Next"}
        </Button>
        {step.error && (
          <p role="alert" className="text-danger w-full text-sm">
            {step.error}
          </p>
        )}
      </form>

      {d && d.route === "unsupported" && (
        <p className="text-ink-2 text-sm">
          {d.providerName ?? "This provider"} isn&apos;t supported.
        </p>
      )}
      {d && (d.route === "google_oauth" || d.route === "microsoft_oauth") && (
        <p className="text-ink-2 text-sm">
          {d.route === "google_oauth" ? "Gmail" : "Outlook"} addresses connect with their own
          sign-in, coming soon.
        </p>
      )}
      {d && d.route === "imap" && step.email && (
        <form action={connect} className="flex flex-col gap-3">
          <input type="hidden" name="email" value={step.email} />
          <p className="text-success text-sm font-medium">
            {d.providerName
              ? `Found settings for ${d.providerName}`
              : "Found the settings for this address"}
          </p>
          {d.preflight.length > 0 && (
            <ul className="text-ink-2 list-disc pl-5 text-sm">
              {d.preflight.map((p) => (
                <li key={p.text}>
                  {p.text}{" "}
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="action-link with-arrow"
                    >
                      How
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {d.steps.length > 0 && (
            <ol className="text-ink-2 list-decimal pl-5 text-sm">
              {d.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {d.helpUrl && (
            <a href={d.helpUrl} target="_blank" rel="noreferrer" className="action-link with-arrow">
              Open {d.providerName ?? "your provider"}&apos;s settings
            </a>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {d.passwordLabel ?? "App password"}
            <input name="password" type="password" autoComplete="off" className="field" required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name on sent mail <span className="text-ink-3 font-normal">(optional)</span>
            <input name="name" className="field" placeholder="Harbour Bean Café" />
          </label>
          {state.error && (
            <div role="alert" className="text-danger flex flex-col gap-1 text-sm">
              <span>{state.info?.title ?? state.error}</span>
              {state.info?.body && <span className="text-ink-2">{state.info.body}</span>}
              {state.info?.helpUrl && (
                <a
                  href={state.info.helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="action-link with-arrow"
                >
                  Fix it at your provider
                </a>
              )}
            </div>
          )}
          <Button type="submit" variant="primary" className="self-start" disabled={connecting}>
            {connecting ? "Signing in…" : "Connect"}
          </Button>
        </form>
      )}
      <p className="meta">
        Gmail and Outlook addresses use their own sign-in instead. Proton Mail isn&apos;t supported.
        Sends up to 200 emails a day.
      </p>
    </div>
  );
}

/** LINE Official Account with its Channel ID and secret. */
export function LineKeysForm() {
  const [state, action, pending] = useActionState<OwnKeyState, FormData>(connectLineAction, {});
  if (state.done) {
    return (
      <p role="status" className="text-success pt-3 text-sm font-medium">
        {state.done}
      </p>
    );
  }
  const err = (f: string) =>
    state.field === f && state.error ? (
      <span role="alert" className="text-danger text-sm">
        {state.error}
      </span>
    ) : null;
  return (
    <form action={action} className="flex flex-col gap-3 pt-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Channel ID
        <input name="channelId" inputMode="numeric" autoComplete="off" className="field" required />
        {err("channelId")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Channel secret
        <input name="channelSecret" type="password" autoComplete="off" className="field" required />
        {err("channelSecret")}
      </label>
      <p className="meta">
        In LINE Official Account Manager: Settings → Messaging API. Turn the Messaging API on, then
        copy the Channel ID and Channel secret.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Checking…" : "Connect"}
        </Button>
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
