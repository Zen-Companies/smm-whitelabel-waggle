"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  addPassword,
  changeEmail,
  changePassword,
  deleteLogin,
  disconnectGoogle,
  signOutEverywhere,
  updateName,
  type AccountState,
} from "./actions";

const MIN = 10;

function Status({ state }: { state: AccountState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-ink-2 text-sm">
        {state.message}
      </p>
    );
  }
  if (state.saved) return <span className="text-success text-sm">Saved</span>;
  return null;
}

/** Profile → Name. */
export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(updateName, {});
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <label htmlFor="account-name" className="text-sm font-semibold">
        Name
      </label>
      <div className="flex gap-2">
        <input
          id="account-name"
          name="name"
          defaultValue={name}
          required
          maxLength={100}
          className="field"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          Save
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

/** Profile → Email, with "Change email" opened in place. */
export function EmailRow({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AccountState, FormData>(changeEmail, {});
  return (
    <div className="border-line flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-col">
          <b className="font-semibold">Email</b>
          <span className="text-ink-2">{email}</span>
        </span>
        {!open && (
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            Change email
          </Button>
        )}
      </div>
      {open && (
        <form action={action} className="flex flex-col gap-2">
          <label htmlFor="new-email" className="text-sm font-semibold">
            New email
          </label>
          <input
            id="new-email"
            name="email"
            type="email"
            required
            className="field"
            autoComplete="email"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              Send confirmation
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <Status state={state} />
        </form>
      )}
      {!open && (
        <span className="meta">
          A new email is confirmed from that inbox before it takes over; until then you sign in with
          the current one.
        </span>
      )}
    </div>
  );
}

/** How you sign in → Password: change it, or add one to a Google-only login. */
export function PasswordRow({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AccountState, FormData>(
    hasPassword ? changePassword : addPassword,
    {},
  );
  const saved = state.saved && !state.error;
  return (
    <div className="border-line flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-col">
          <b className="font-semibold">Password</b>
          <span className="text-ink-2 text-sm">
            {saved ? "Saved" : hasPassword ? "Set" : "Not set: you sign in with Google"}
          </span>
        </span>
        {!open && (
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            {hasPassword ? "Change password" : "Add a password"}
          </Button>
        )}
      </div>
      {open && !saved && (
        <form action={action} className="flex flex-col gap-3">
          {hasPassword && (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between">
                <label htmlFor="current-password" className="text-sm font-semibold">
                  Current password
                </label>
                <a href="/forgot" className="text-sm font-medium">
                  Forgot it?
                </a>
              </span>
              <input
                id="current-password"
                name="current"
                type="password"
                required
                autoComplete="current-password"
                className="field"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-password" className="text-sm font-semibold">
              New password
            </label>
            <input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={MIN}
              autoComplete="new-password"
              className="field"
            />
            <span className="meta">At least {MIN} characters.</span>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              Save password
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <Status state={state} />
        </form>
      )}
    </div>
  );
}

/** How you sign in → Disconnect Google. */
export function DisconnectGoogle() {
  const [state, action, pending] = useActionState<AccountState>(disconnectGoogle, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="secondary" disabled={pending}>
        Disconnect
      </Button>
      <Status state={state} />
    </form>
  );
}

/** Sessions → Sign out everywhere. */
export function SignOutEverywhere() {
  return (
    <form action={signOutEverywhere}>
      <Button type="submit" variant="secondary">
        Sign out everywhere
      </Button>
    </form>
  );
}

/** Delete login: type the email, then it's gone. */
export function DeleteLoginForm({ email }: { email: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<AccountState, FormData>(deleteLogin, {});
  if (!asking) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="text-danger w-fit"
        onClick={() => setAsking(true)}
      >
        Delete login
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="delete-confirm" className="text-sm font-semibold">
        Type {email} to confirm
      </label>
      <input id="delete-confirm" name="confirm" autoComplete="off" className="field" />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={pending} className="text-danger">
          Delete my login
        </Button>
        <Button type="button" variant="quiet" onClick={() => setAsking(false)}>
          Keep it
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}
