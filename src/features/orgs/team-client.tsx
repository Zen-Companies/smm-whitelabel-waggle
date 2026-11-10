"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { ROLE_HINT, ROLE_LABEL, type OrgRole } from "./abilities";
import {
  cancelInvite,
  changeMemberBrands,
  changeMemberRole,
  inviteMember,
  removeMember,
  resendInvite,
  type InviteRowState,
  type InviteState,
  type MemberState,
} from "./team-actions";

type Brand = { id: string; name: string };

/** "All brands, including new ones" or "Only these brands" with a tick per brand. */
function BrandsPicker({
  brands,
  allBrands,
  selected,
  idPrefix,
  invalid,
}: {
  brands: Brand[];
  allBrands: boolean;
  selected: string[];
  idPrefix: string;
  invalid?: boolean;
}) {
  const [some, setSome] = useState(!allBrands);
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0" aria-invalid={invalid || undefined}>
      <legend className="pb-2 text-sm font-semibold">Brands</legend>
      <label className="flex min-h-9 items-center gap-2.5">
        <input
          type="radio"
          name="brands"
          value="all"
          checked={!some}
          onChange={() => setSome(false)}
          className="size-4 accent-[var(--ink)]"
        />
        All brands, including new ones
      </label>
      <label className="flex min-h-9 items-center gap-2.5">
        <input
          type="radio"
          name="brands"
          value="some"
          checked={some}
          onChange={() => setSome(true)}
          className="size-4 accent-[var(--ink)]"
        />
        Only these brands
      </label>
      {some && (
        <div className="flex flex-col pl-7">
          {brands.length === 0 && (
            <span className="meta">This organization has no brands yet.</span>
          )}
          {brands.map((b) => (
            <label
              key={b.id}
              htmlFor={`${idPrefix}-${b.id}`}
              className="flex min-h-9 items-center gap-2.5"
            >
              <input
                id={`${idPrefix}-${b.id}`}
                type="checkbox"
                name="tenantIds"
                value={b.id}
                defaultChecked={selected.includes(b.id)}
                className="size-4 accent-[var(--ink)]"
              />
              {b.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** The invite panel (design OrgTeam, right column). Sent: clears, and says so in place. */
export function InviteForm({
  orgId,
  roles,
  brands,
}: {
  orgId: string;
  roles: Exclude<OrgRole, "owner">[];
  brands: Brand[];
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, {});
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.sent) {
      form.current?.reset();
    }
  }, [state.sent]);

  return (
    <section aria-labelledby="invite-heading" className="card flex flex-col gap-4 p-5">
      <h2 id="invite-heading" className="text-base font-semibold">
        Invite someone
      </h2>
      {state.sent && (
        <div
          role="status"
          className="bg-success-soft text-success flex flex-col gap-2 rounded-lg px-3.5 py-3 text-sm"
        >
          <span>
            {state.sent.refreshed ? "Invite sent again to " : "Invite sent to "}
            <b className="font-semibold">{state.sent.email}</b>.{" "}
            {state.sent.hasLogin
              ? "They can accept it from the email or their Waggle welcome page."
              : "They don't have a Waggle login yet; the email asks them to make one."}
          </span>
          <button
            type="button"
            className="text-ink w-fit text-sm font-medium underline underline-offset-4"
            onClick={() => {
              const at = state.sent!.at;
              void navigator.clipboard?.writeText(state.sent!.link).then(() => setCopiedAt(at));
            }}
          >
            {copiedAt === state.sent.at ? "Link copied" : "Copy invite link"}
          </button>
        </div>
      )}
      <form ref={form} action={action} className="flex flex-col gap-4">
        <input type="hidden" name="orgId" value={orgId} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            defaultValue={state.sent ? "" : state.email}
            key={state.sent?.at ?? state.email}
            aria-invalid={state.field === "email" || undefined}
            aria-describedby={state.field === "email" ? "invite-error" : undefined}
            className="field"
          />
        </div>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="pb-2 text-sm font-semibold">Role</legend>
          {roles.map((r, i) => (
            <label
              key={r}
              className="has-[:checked]:border-ink border-line flex cursor-pointer gap-2.5 rounded-lg border-[1.5px] px-3 py-2.5"
            >
              <input
                type="radio"
                name="role"
                value={r}
                defaultChecked={r === "member" || (i === 0 && !roles.includes("member"))}
                className="mt-1 size-4 accent-[var(--ink)]"
              />
              <span className="flex flex-col">
                <b className="font-semibold">{ROLE_LABEL[r]}</b>
                <span className="text-ink-2 text-xs">{ROLE_HINT[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <BrandsPicker
          brands={brands}
          allBrands
          selected={[]}
          idPrefix="invite"
          invalid={state.field === "brands"}
        />
        {state.error && (
          <p id="invite-error" role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Sending…" : "Send invite"}
        </Button>
        <span className="meta">The link works for 7 days and only for this email address.</span>
      </form>
    </section>
  );
}

/** A member's role menu: saves on change, "Saved" in place. */
export function RoleSelect({
  orgId,
  userId,
  role,
  roles,
  label,
}: {
  orgId: string;
  userId: string;
  role: OrgRole;
  roles: OrgRole[];
  label: string;
}) {
  const [state, action, pending] = useActionState<MemberState, FormData>(changeMemberRole, {});
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col gap-1">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        aria-label={label}
        defaultValue={role}
        key={state.saved ?? role}
        disabled={pending}
        onChange={() => form.current?.requestSubmit()}
        className="field min-h-9 w-auto py-0 text-sm"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {state.saved && !state.error && <span className="text-success text-xs">Saved</span>}
      {state.error && (
        <span role="alert" className="text-danger text-xs">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** "Change brands" and "Remove" under a member's row, opened in place. */
export function MemberManage({
  orgId,
  userId,
  name,
  allBrands,
  brandIds,
  brands,
}: {
  orgId: string;
  userId: string;
  name: string;
  allBrands: boolean;
  brandIds: string[];
  brands: Brand[];
}) {
  const [open, setOpen] = useState<null | "brands" | "remove">(null);
  const [brandState, brandAction, brandPending] = useActionState<MemberState, FormData>(
    changeMemberBrands,
    {},
  );
  const [removeState, removeAction, removePending] = useActionState<MemberState, FormData>(
    removeMember,
    {},
  );
  // Saving closes the brands panel: it was opened before that save.
  const [openedAt, setOpenedAt] = useState(0);
  const shown = open === "brands" && (brandState.saved ?? 0) > openedAt ? null : open;
  const toggle = (panel: "brands" | "remove") => {
    setOpenedAt(Date.now());
    setOpen(shown === panel ? null : panel);
  };
  if (removeState.removed) return <span className="meta">Removed</span>;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1">
        <button
          type="button"
          aria-expanded={shown === "brands"}
          onClick={() => toggle("brands")}
          className="text-ink-2 hover:bg-subtle hover:text-ink min-h-9 rounded-md px-2.5 text-sm"
        >
          Change brands
        </button>
        <button
          type="button"
          aria-expanded={shown === "remove"}
          onClick={() => toggle("remove")}
          className="text-danger hover:bg-subtle min-h-9 rounded-md px-2.5 text-sm"
        >
          Remove
        </button>
      </div>
      {brandState.saved && !shown && <span className="text-success text-xs">Saved</span>}
      {shown === "brands" && (
        <form action={brandAction} className="card flex w-72 flex-col gap-3 p-4 text-left">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="userId" value={userId} />
          <BrandsPicker
            brands={brands}
            allBrands={allBrands}
            selected={brandIds}
            idPrefix={`m-${userId}`}
          />
          {brandState.error && (
            <p role="alert" className="text-danger text-sm">
              {brandState.error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={brandPending}>
              Save
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {shown === "remove" && (
        <form action={removeAction} className="card flex w-72 flex-col gap-3 p-4 text-left">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="userId" value={userId} />
          <p className="text-sm">
            Remove <b className="font-semibold">{name}</b>? Their access to every brand here ends at
            once. They keep their own login and other organizations.
          </p>
          {removeState.error && (
            <p role="alert" className="text-danger text-sm">
              {removeState.error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="secondary"
              disabled={removePending}
              className="text-danger"
            >
              Remove {name.split(" ")[0]}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(null)}>
              Keep
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Resend / Copy link / Cancel on an invite row. */
export function InviteActions({
  orgId,
  inviteId,
  expired,
}: {
  orgId: string;
  inviteId: string;
  expired: boolean;
}) {
  const [resent, resend, resending] = useActionState<InviteRowState, FormData>(resendInvite, {});
  const [cancelled, cancel, cancelling] = useActionState<InviteRowState, FormData>(
    cancelInvite,
    {},
  );
  const [copied, setCopied] = useState(false);
  const small =
    "border-line-strong hover:bg-subtle min-h-8 rounded-md border bg-surface px-2.5 text-xs font-medium disabled:opacity-50";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {resent.sent ? (
          <button
            type="button"
            className={small}
            onClick={() =>
              void navigator.clipboard?.writeText(resent.sent!.link).then(() => setCopied(true))
            }
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        ) : (
          <form action={resend}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="inviteId" value={inviteId} />
            <button
              type="submit"
              disabled={resending}
              className={cn(small, expired && "font-semibold")}
            >
              {resending ? "Sending…" : "Resend"}
            </button>
          </form>
        )}
        <form action={cancel}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="inviteId" value={inviteId} />
          <button type="submit" disabled={cancelling} className={small}>
            {expired ? "Remove" : "Cancel"}
          </button>
        </form>
      </div>
      {resent.sent && <span className="text-success text-xs">Sent again with a new link</span>}
      {(resent.error || cancelled.error) && (
        <span role="alert" className="text-danger text-xs">
          {resent.error ?? cancelled.error}
        </span>
      )}
    </div>
  );
}
