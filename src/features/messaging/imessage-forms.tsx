"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelImessageAction,
  imessageNumbersAction,
  orderImessageAction,
  renameImessageAction,
  type NumbersState,
  type RcsState,
} from "./actions";
import { IMESSAGE_REGIONS, type ImessageRegion } from "./imessage";

const display = (e164: string) =>
  e164.startsWith("+1") && e164.length === 12
    ? `+1 ${e164.slice(2, 5)} ${e164.slice(5, 8)} ${e164.slice(8)}`
    : e164;

/** Get an iMessage number (design "Settings · Messaging"): US or UK, instant or assigned. */
export function ImessageOrder({
  purchaseIntentId,
  businessName,
}: {
  purchaseIntentId: string;
  businessName: string;
}) {
  const [state, action, pending] = useActionState<RcsState, FormData>(orderImessageAction, {});
  const [numbers, setNumbers] = useState<NumbersState>({});
  const [loading, startLoading] = useTransition();
  const [region, setRegion] = useState<ImessageRegion>("US");
  const [pick, setPick] = useState("any");
  useEffect(() => {
    startLoading(async () => {
      const f = new FormData();
      f.set("region", region);
      setNumbers(await imessageNumbersAction({}, f));
      setPick("any");
    });
  }, [region]);
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
  const list = numbers.region === region ? (numbers.numbers ?? []) : [];
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="purchaseIntentId" value={purchaseIntentId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Number</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(IMESSAGE_REGIONS) as ImessageRegion[]).map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-sm ${region === r ? "border-ink bg-ink text-surface" : "border-line-strong"}`}
            >
              <input
                type="radio"
                name="region"
                value={r}
                checked={region === r}
                onChange={() => setRegion(r)}
                className="sr-only"
              />
              {IMESSAGE_REGIONS[r]}
            </label>
          ))}
        </div>
        {err("region")}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Pick a number</legend>
        {loading ? (
          <p className="meta">Finding numbers…</p>
        ) : numbers.error ? (
          <p className="text-danger text-sm">{numbers.error}</p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          {list.map((n) => (
            <label key={n.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="availableNumberId"
                value={n.id}
                checked={pick === n.id}
                onChange={() => setPick(n.id)}
                className="size-4"
              />
              <span className="font-medium tabular-nums">{display(n.phone)}</span>
              {n.location && <span className="meta">{n.location}</span>}
              <span className="meta">· turns on at once</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="availableNumberId"
              value="any"
              checked={pick === "any"}
              onChange={() => setPick("any")}
              className="size-4"
            />
            {list.length ? "Any number" : "Assign me a number"}
            <span className="meta">· turns on within a few hours</span>
          </label>
        </div>
        {pick === "any" && region === "US" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Near ZIP (optional)
            <input name="zipCode" inputMode="numeric" maxLength={5} className="field w-32" />
            {err("zipCode")}
          </label>
        )}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name on the contact card
        <input name="cardName" defaultValue={businessName} maxLength={60} className="field w-72" />
        <span className="meta">What people see when they save your number.</span>
        {err("cardName")}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" value="yes" className="mt-0.5 size-4" />
        <span>$200 a month from the day it turns on. A started month isn&apos;t refunded.</span>
      </label>
      {err("agree")}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Ordering…" : "Get an iMessage number"}
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

/** The contact card name, after ordering. */
export function ImessageRename({ senderId, name }: { senderId: string; name: string }) {
  const [state, action, pending] = useActionState<RcsState, FormData>(renameImessageAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="senderId" value={senderId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name on the contact card
        <input name="cardName" defaultValue={name} maxLength={60} className="field w-72" />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
      {state.done && (
        <span role="status" className="text-success text-sm">
          {state.done}
        </span>
      )}
    </form>
  );
}

export function ImessageCancel({ senderId, label }: { senderId: string; label: string }) {
  const [state, action, pending] = useActionState<RcsState, FormData>(cancelImessageAction, {});
  const [sure, setSure] = useState(false);
  return sure ? (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="senderId" value={senderId} />
      <span>Cancel {label}? It stops at once and this month isn&apos;t refunded.</span>
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Canceling…" : "Cancel number"}
      </Button>
      <Button type="button" variant="quiet" onClick={() => setSure(false)}>
        Keep it
      </Button>
      {state.error && (
        <span role="alert" className="text-danger">
          {state.error}
        </span>
      )}
    </form>
  ) : (
    <Button type="button" variant="quiet" onClick={() => setSure(true)}>
      Cancel
    </Button>
  );
}

/** The opt-in link: opens Messages on the number with the first message filled in. */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="bg-subtle max-w-full truncate rounded px-2 py-1 text-xs">{link}</code>
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          navigator.clipboard.writeText(link).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
