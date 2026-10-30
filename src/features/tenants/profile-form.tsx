"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateBusinessProfile, type ProfileFormState } from "./actions";

/**
 * "How Waggle understands your business" (T25): a few plain sentences the classifier
 * reads with every message. Feedback in place (design.md §4).
 */
export function ProfileForm({ profile, max }: { profile: string; max: number }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    updateBusinessProfile,
    {},
  );
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="business-profile" className="font-semibold">
          How Waggle understands your business
        </label>
        <p className="text-sm text-gray-700">
          A few sentences: what you sell, how customers buy or book, and words they use. It helps
          Waggle tell a question from someone ready to buy.
        </p>
      </div>
      <textarea
        id="business-profile"
        name="profile"
        rows={4}
        maxLength={max}
        defaultValue={profile}
        placeholder="e.g. We sell Lightroom presets and Canva templates as instant downloads through Gumroad. “Link?” or “how to buy” means someone wants to buy."
        className="field"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved && !pending && (
          <span role="status" className="inline-flex items-center gap-1 text-sm">
            <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
            Saved. New messages use it.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
