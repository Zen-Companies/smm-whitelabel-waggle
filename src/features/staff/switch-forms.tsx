"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { BrandSwitchKey } from "@/lib/flags/brand-switch";
import { switchBrand, type StaffFormState } from "./actions";

/** Staff: turn a paid channel off for one business. */
export function SwitchOffForm({
  switchKey,
  tenantId,
}: {
  switchKey: BrandSwitchKey;
  tenantId: string;
}) {
  const [state, action, pending] = useActionState<StaffFormState, FormData>(switchBrand, {});
  return (
    <form action={action} className="flex items-center gap-2 text-sm">
      <input type="hidden" name="key" value={switchKey} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="on" value="false" />
      <Button type="submit" variant="quiet" disabled={pending}>
        Turn off
      </Button>
      {state.error && (
        <span role="alert" className="text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Staff: pick a business to turn a paid channel on for. */
export function SwitchOnForm({
  switchKey,
  brands,
}: {
  switchKey: BrandSwitchKey;
  brands: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<StaffFormState, FormData>(switchBrand, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="key" value={switchKey} />
      <input type="hidden" name="on" value="true" />
      <label className="flex flex-col gap-1.5 font-medium">
        Business
        <select name="tenantId" className="field w-72">
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" disabled={pending || !brands.length}>
        Turn on for this business
      </Button>
      {state.error && (
        <span role="alert" className="text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
