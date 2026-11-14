"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { setStockAction, type StockState } from "./actions";

/** Edit stock (design "Posts · Shop"): the units at one location. */
export function StockForm({
  accountId,
  productId,
  variantId,
  label,
  current,
  locations,
}: {
  accountId: string;
  productId: string;
  variantId: string;
  label: string;
  current: number;
  locations: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<StockState, FormData>(setStockAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Edit stock
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId} />
      {locations.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          At
          <select name="locationId" className="field w-40">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="locationId" value={locations[0]?.id ?? ""} />
      )}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Units
        <input
          name="quantity"
          type="number"
          min={0}
          step={1}
          defaultValue={locations.length > 1 ? "" : current}
          aria-label={`Units of ${label}`}
          className="field w-24"
        />
      </label>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
      {state.done && !pending && (
        <span role="status" className="text-success text-sm">
          {state.done}
        </span>
      )}
    </form>
  );
}
