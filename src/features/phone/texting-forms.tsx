"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  enableTextingAction,
  registerTextingAction,
  textingCodeAction,
  type TextingState,
} from "./actions";
import { ENTITY_TYPES, USECASES, VERTICALS } from "./registration";

export function EnableTexting({ numberId }: { numberId: string }) {
  const [state, action, pending] = useActionState<TextingState, FormData>(enableTextingAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="numberId" value={numberId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Turning on…" : "Turn on texting"}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}

type Field = { name: string; label: string; placeholder?: string; type?: string; hint?: string };

/** Our own US texting registration form (design "Texting (US)": business details, what you'll text). */
export function RegistrationForm({
  numberId,
  businessName,
}: {
  numberId: string;
  businessName: string;
}) {
  const [state, action, pending] = useActionState<TextingState, FormData>(
    registerTextingAction,
    {},
  );
  const [kind, setKind] = useState<"company" | "sole">("company");
  if (state.done) {
    return (
      <p role="status" className="text-success text-sm font-medium">
        {state.done}
      </p>
    );
  }
  const err = (f: string) =>
    state.field === f && state.error ? (
      <span role="alert" className="text-danger text-sm">
        {state.error}
      </span>
    ) : null;
  const input = (f: Field) => (
    <label key={f.name} className="flex flex-col gap-1.5 text-sm font-medium">
      {f.label}
      <input name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} className="field" />
      {f.hint && <span className="meta">{f.hint}</span>}
      {err(f.name)}
    </label>
  );
  const select = (name: string, label: string, options: Record<string, string>) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <select name={name} className="field">
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {err(name)}
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="numberId" value={numberId} />
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 font-medium">Your business is</legend>
        {(
          [
            ["company", "A company with an EIN"],
            ["sole", "Just me (sole proprietor, no EIN)"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="size-4"
            />
            {l}
          </label>
        ))}
      </fieldset>
      <h4 className="text-sm font-semibold">Your business details</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {input({ name: "displayName", label: "Name customers know", placeholder: businessName })}
        {kind === "company" && input({ name: "companyName", label: "Legal company name" })}
        {kind === "company" && input({ name: "ein", label: "EIN", placeholder: "12-3456789" })}
        {kind === "company" && select("entityType", "Kind of business", ENTITY_TYPES)}
        {kind === "company" &&
          input({
            name: "businessPhone",
            label: "Business phone",
            placeholder: "+1 415 555 0199",
            type: "tel",
          })}
        {kind === "sole" &&
          input({
            name: "mobilePhone",
            label: "Your mobile",
            placeholder: "+1 415 555 0123",
            type: "tel",
            hint: "Carriers text you a code to confirm it's you.",
          })}
        {input({ name: "website", label: "Website or social page", placeholder: "https://…" })}
        {select("vertical", "What the business does", VERTICALS)}
        {input({ name: "street", label: "Street address" })}
        {input({ name: "city", label: "City" })}
        {input({ name: "state", label: "State", placeholder: "CA" })}
        {input({ name: "postalCode", label: "ZIP" })}
      </div>
      <h4 className="text-sm font-semibold">What you&apos;ll text about</h4>
      {select("usecase", "Mostly", USECASES)}
      {input({
        name: "optInPage",
        label: "Where people agree to get your texts",
        placeholder: "https://…/contact",
        hint: "A page that says customers can text you, or tick a box to get texts. Carriers check it.",
      })}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Example text 1
        <textarea
          name="sample1"
          rows={2}
          className="field min-h-16 py-2"
          placeholder={`${businessName}: your table for 4 is ready at 7pm. Reply STOP to opt out.`}
        />
        {err("sample1")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Example text 2
        <textarea
          name="sample2"
          rows={2}
          className="field min-h-16 py-2"
          placeholder={`${businessName}: thanks for your order! Reply HELP for help.`}
        />
        {err("sample2")}
      </label>
      <p className="meta">
        $4–$20 a month in carrier fees, plus about 1¢ a text. Review takes days to a few weeks; you
        can receive texts meanwhile.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send for review"}
        </Button>
        {state.error && !state.field && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

/** Sole proprietors: the code carriers texted to the owner's mobile. */
export function RegistrationCode({ numberId }: { numberId: string }) {
  const [state, action, pending] = useActionState<TextingState, FormData>(textingCodeAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="numberId" value={numberId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Code from the text
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="field w-36"
        />
      </label>
      <Button type="submit" name="op" value="verify" variant="primary" disabled={pending}>
        Confirm
      </Button>
      <Button type="submit" name="op" value="resend" variant="quiet" disabled={pending}>
        Send a new code
      </Button>
      {(state.error || state.done) && (
        <span
          role={state.error ? "alert" : "status"}
          className={`w-full text-sm ${state.error ? "text-danger" : "text-success"}`}
        >
          {state.error ?? state.done}
        </span>
      )}
    </form>
  );
}
