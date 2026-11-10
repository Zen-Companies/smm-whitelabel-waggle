"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ORG_NAME_MAX } from "./copy";
import {
  closeOrganization,
  leaveOrganization,
  renameOrganization,
  type LeaveState,
  type OrgFormState,
} from "./settings-actions";

/** General → Name. "Saved" in place. */
export function OrgNameForm({
  orgId,
  name,
  disabled,
}: {
  orgId: string;
  name: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<OrgFormState, FormData>(renameOrganization, {});
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="orgId" value={orgId} />
      <label htmlFor="org-name" className="text-sm font-semibold">
        Name
      </label>
      <div className="flex gap-2">
        <input
          id="org-name"
          name="name"
          required
          maxLength={ORG_NAME_MAX}
          defaultValue={state.name ?? name}
          disabled={disabled}
          aria-invalid={state.error ? true : undefined}
          className="field"
        />
        <Button type="submit" variant="secondary" disabled={pending || disabled}>
          Save
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      ) : state.saved ? (
        <span className="text-success text-sm">Saved</span>
      ) : (
        <span className="meta">Shown in the switcher and on invites.</span>
      )}
    </form>
  );
}

/** General → Leave. Asks once, in place. */
export function LeaveOrgForm({
  orgId,
  orgName,
  brands,
}: {
  orgId: string;
  orgName: string;
  brands: number;
}) {
  const [state, action, pending] = useActionState<LeaveState, FormData>(leaveOrganization, {});
  const [asking, setAsking] = useState(false);
  return (
    <section className="card flex flex-col gap-3 border-red-200 p-5">
      <h2 className="text-base font-semibold">Leave {orgName}</h2>
      <p className="text-ink-2">
        You&apos;ll lose access to its {brands} {brands === 1 ? "brand" : "brands"}. Your other
        organizations aren&apos;t affected.
      </p>
      {asking ? (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <Button type="submit" variant="secondary" disabled={pending} className="text-danger">
            Yes, leave {orgName}
          </Button>
          <Button type="button" variant="quiet" onClick={() => setAsking(false)}>
            Stay
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="text-danger w-fit"
          onClick={() => setAsking(true)}
        >
          Leave organization
        </Button>
      )}
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </section>
  );
}

/** General → Close (owners). The name must be typed, so it can't happen by accident. */
export function CloseOrgForm({
  orgId,
  orgName,
  brands,
}: {
  orgId: string;
  orgName: string;
  brands: number;
}) {
  const [state, action, pending] = useActionState<LeaveState, FormData>(closeOrganization, {});
  const [asking, setAsking] = useState(false);
  return (
    <section className="card flex flex-col gap-3 border-red-200 p-5">
      <h2 className="text-base font-semibold">Close {orgName}</h2>
      <p className="text-ink-2">
        Stops Waggle for {brands === 1 ? "its brand" : `all ${brands} brands`} and ends the bill.
        Brands can be restored for 3 months, then they&apos;re deleted.
      </p>
      {asking ? (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <label htmlFor="close-confirm" className="text-sm font-semibold">
            Type {orgName} to confirm
          </label>
          <input id="close-confirm" name="confirm" autoComplete="off" className="field" />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={pending} className="text-danger">
              Close organization
            </Button>
            <Button type="button" variant="quiet" onClick={() => setAsking(false)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="text-danger w-fit"
          onClick={() => setAsking(true)}
        >
          Close organization
        </Button>
      )}
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </section>
  );
}
