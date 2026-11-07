"use client";

import { Check } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addStaff, changeRole, removeStaff, type StaffFormState } from "./actions";

type Option = { value: string; label: string };

/** A person's role: saved as soon as it changes; the result shows beside it. */
export function RoleSelect({
  userId,
  name,
  role,
  roles,
}: {
  userId: string;
  name: string;
  role: string;
  roles: Option[];
}) {
  // Not a <form action>: React resets a form after its action, which showed the old role again.
  const [value, setValue] = useState(role);
  const [state, setState] = useState<StaffFormState>({});
  const [pending, startTransition] = useTransition();
  const save = (next: string) => {
    const before = value;
    setValue(next);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", next);
    startTransition(async () => {
      const out = await changeRole({}, fd);
      if (out.error) setValue(before);
      setState(out);
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        aria-label={`Role for ${name}`}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        className="field min-h-9 w-auto pr-8 text-[13px]"
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {state.saved && !pending && (
        <span role="status" className="meta inline-flex items-center gap-1">
          <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
          Saved
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </div>
  );
}

/** Remove, with an inline confirmation (no dialogs, design.md §4). */
export function RemoveStaff({ userId, name }: { userId: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action, pending] = useActionState<StaffFormState, FormData>(removeStaff, {});
  if (!confirm) {
    return (
      <Button type="button" size="sm" onClick={() => setConfirm(true)}>
        Remove
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <span className="text-sm">Remove {name}?</span>
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      <Button type="button" size="sm" variant="quiet" onClick={() => setConfirm(false)}>
        Keep
      </Button>
      {state.error && (
        <span role="alert" className="text-danger basis-full text-right text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function AddStaffForm({ roles }: { roles: Option[] }) {
  const [state, action, pending] = useActionState<StaffFormState, FormData>(addStaff, {});
  return (
    <form
      action={action}
      className="card flex flex-wrap items-end gap-2.5 p-4"
      aria-labelledby="add-staff"
    >
      <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <label id="add-staff" htmlFor="staff-email" className="text-sm font-semibold">
          Add someone by email
        </label>
        <input
          id="staff-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="name@zencompaniesinc.com"
          className="field min-h-11"
        />
      </span>
      <span className="flex flex-col gap-1">
        <label htmlFor="staff-role" className="text-sm font-semibold">
          Role
        </label>
        <select id="staff-role" name="role" defaultValue="viewer" className="field min-h-11 w-36">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </span>
      <Button type="submit" variant="primary" className="min-h-11" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {state.saved && !pending && (
        <span role="status" className="meta inline-flex items-center gap-1">
          <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
          Added
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-danger basis-full text-sm">
          {state.error}
        </span>
      )}
      <span className="meta basis-full text-xs">
        They need a Waggle login first. Staff roles never give access to a brand&apos;s inbox.
      </span>
    </form>
  );
}
