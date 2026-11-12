"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createTemplate, type TemplateFormState } from "./actions";

/** New template (design v3 "WhatsApp · window and templates"): plain words, not Meta's terms. */
export function NewTemplateForm() {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(createTemplate, {});
  return (
    <form
      key={state.savedAt}
      action={action}
      className="border-line flex flex-col gap-3 rounded-2xl border p-5"
    >
      <h3 className="text-[15px] font-semibold">New template</h3>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Name</span>
        <input
          name="label"
          required
          maxLength={60}
          placeholder="Order ready for pickup"
          className="field"
        />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">Kind</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="kind" value="update" defaultChecked className="mt-1" />
          <span>
            <b className="font-semibold">Update</b>{" "}
            <span className="text-ink-3">orders, bookings, follow-ups. Cheaper.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="kind" value="promotion" className="mt-1" />
          <span>
            <b className="font-semibold">Promotion</b>{" "}
            <span className="text-ink-3">offers and news. Costs more; people can opt out.</span>
          </span>
        </label>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Message</span>
        <textarea
          name="text"
          required
          rows={3}
          maxLength={1024}
          placeholder="Hi [name], your order is ready for pickup. See you soon!"
          className="field py-2.5"
        />
        <span className="text-ink-3 text-xs">
          [name] is filled in with each customer&apos;s first name. Waggle turns it into Meta&apos;s
          format for you.
        </span>
      </label>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.savedAt && (
        <p role="status" className="text-ink-2 text-sm">
          Sent to Meta for review. It shows as In review until Meta decides, usually within a day.
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send to Meta for review"}
        </Button>
      </div>
    </form>
  );
}
