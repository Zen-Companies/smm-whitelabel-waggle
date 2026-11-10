"use client";

import { CreditCard } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { addBrand, type AddBrandState } from "./brand-actions";
import { BRAND_NAME_MAX } from "./brand-pick";

/**
 * Add a brand (T47, T54): the name, then Waggle opens the new brand. It goes into `orgId`'s
 * organization. A name already used there is refused under the field; no toasts (design.md §4).
 */
export function AddBrandForm({
  orgId,
  orgName,
  cancelHref = "/inbox",
  submitLabel = "Add brand",
  autoFocus = true,
}: {
  orgId: string;
  orgName: string;
  cancelHref?: string | null;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [state, action, pending] = useActionState<AddBrandState, FormData>(addBrand, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="orgId" value={orgId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="brand-name" className="font-semibold">
          Brand name
        </label>
        <input
          id="brand-name"
          name="name"
          defaultValue={state.name}
          key={state.name}
          required
          maxLength={BRAND_NAME_MAX}
          autoComplete="organization"
          autoFocus={autoFocus}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "brand-name-error brand-name-hint" : "brand-name-hint"}
          className="field"
        />
        <span id="brand-name-hint" className="text-ink-3 text-sm">
          The name customers know. Waggle uses it in replies.
        </span>
        {state.error && (
          <p id="brand-name-error" role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>

      <div className="border-line bg-subtle/60 flex items-start gap-3 rounded-xl border px-4 py-3.5">
        <CreditCard
          className="text-ink-2 mt-0.5 size-[18px] shrink-0"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="flex flex-col gap-0.5">
          <b className="font-semibold">On {orgName}&apos;s bill</b>
          <span className="text-ink-2">
            One bill covers all of {orgName}&apos;s brands. Its Owner manages it.
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Adding…" : submitLabel}
        </Button>
        {cancelHref && (
          <Link href={cancelHref} className={buttonVariants({ variant: "quiet" })}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
