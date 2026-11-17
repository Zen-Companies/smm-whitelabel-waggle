"use client";

import { useState } from "react";
import { BUSINESS_KINDS, CUSTOM_KIND_MAX } from "./starter";

/**
 * Step 1's "What kind of business?". Picking Something else opens "What kind, in a few words?"
 * right under the choices (approved 17 Nov); step 3 suggests questions from it.
 */
export function KindPicker({ current, custom }: { current: string | null; custom: string }) {
  const [picked, setPicked] = useState(current);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">What kind of business?</legend>
      <div className="flex flex-wrap gap-2">
        {BUSINESS_KINDS.map((k) => (
          <label
            key={k.key}
            className="border-line-strong has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-sm has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              name="kind"
              value={k.key}
              defaultChecked={current === k.key}
              onChange={() => setPicked(k.key)}
              required
              className="sr-only"
            />
            {k.label}
          </label>
        ))}
      </div>
      {picked === "other" && (
        <label className="border-honey mt-2 flex flex-col gap-1.5 border-l-[3px] pl-4 text-sm font-medium">
          What kind, in a few words?
          <input
            name="kindOther"
            defaultValue={custom}
            maxLength={CUSTOM_KIND_MAX}
            autoFocus={!custom}
            placeholder="Dog grooming"
            className="field font-normal"
          />
          <span className="text-ink-3 font-normal">
            Waggle picks the questions people ask a business like yours.
          </span>
        </label>
      )}
    </fieldset>
  );
}
