"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AdLead, AdLeadStatus } from "@/lib/social/types";
import { addLeadToContacts, createLeadFormAction, setLeadStatus, type LeadFormState } from "./lead-actions";
import { leadConsented, leadContact } from "./lead-form";

export const LEAD_STATUS: Record<AdLeadStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-info-soft text-info" },
  contacted: { label: "Contacted", tone: "bg-honey-tint text-honey-text" },
  unreachable: { label: "Can't reach", tone: "bg-danger-soft text-danger" },
  qualified: { label: "Qualified", tone: "bg-success-soft text-success" },
  converted: { label: "Won", tone: "bg-success-soft text-success" },
  disqualified: { label: "Not a fit", tone: "bg-subtle text-ink-3" },
};

const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
const label = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** One lead: the answers, whether they agreed to messages, status, and Add to contacts. */
export function AdLeadRow({ lead, canEdit }: { lead: AdLead; canEdit: boolean }) {
  const [st, act, pending] = useActionState<LeadFormState, FormData>(setLeadStatus, {});
  const [add, addAct, adding] = useActionState<LeadFormState, FormData>(addLeadToContacts, {});
  const [open, setOpen] = useState(false);
  const person = leadContact(lead.fields);
  const s = LEAD_STATUS[lead.status];
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-[200px] flex-1 flex-col text-left" aria-expanded={open}>
          <b className="font-semibold">{person.name}</b>
          <span className="meta truncate">
            {[person.email, person.phone].filter(Boolean).join(" · ")} · {lead.formName} · {ago(lead.createdAt)}
          </span>
        </button>
        {leadConsented(lead.consents) && (
          <span className="bg-success-soft text-success rounded-full px-2.5 py-0.5 text-xs font-semibold">Agreed to messages</span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.tone}`}>{s.label}</span>
      </div>
      {open && (
        <dl className="bg-subtle grid gap-x-4 gap-y-1 rounded-xl p-3 text-sm sm:grid-cols-[180px_1fr]">
          {Object.entries(lead.fields).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{label(k)}</dt>
              <dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <form action={act} className="flex items-center gap-2">
            <input type="hidden" name="id" value={lead.id} />
            <label htmlFor={`st-${lead.id}`} className="sr-only">
              Status
            </label>
            <select id={`st-${lead.id}`} name="status" defaultValue={lead.status} className="field h-9 w-40 py-1">
              {(Object.keys(LEAD_STATUS) as AdLeadStatus[]).map((k) => (
                <option key={k} value={k}>
                  {LEAD_STATUS[k].label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="quiet" disabled={pending}>
              Save
            </Button>
          </form>
          {!lead.contactId && !add.done && (
            <form action={addAct}>
              <input type="hidden" name="id" value={lead.id} />
              <Button type="submit" variant="secondary" disabled={adding}>
                Add to contacts
              </Button>
            </form>
          )}
        </div>
      )}
      {(add.done || add.error || st.error) && (
        <p role={add.error || st.error ? "alert" : "status"} className={`text-sm ${add.error || st.error ? "text-danger" : ""}`}>
          {add.done ?? add.error ?? st.error}
        </p>
      )}
    </li>
  );
}

/** New lead form (T78c): questions, privacy link, thank-you, and the messages box (always added). */
export function LeadFormBuilder({ pages }: { pages: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<LeadFormState, FormData>(createLeadFormAction, {});
  const err = (f: string) =>
    state.field === f && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;
  if (state.savedAt && !state.error) {
    return <p role="status" className="card p-5">Form created. Pick it as “Get leads” when you boost a post or make an ad.</p>;
  }
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <h2 className="section-title">New lead form</h2>
      <p className="text-ink-2 text-sm">Shown inside a Facebook or Instagram ad. People fill it without leaving the app.</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Form name
        <input name="name" placeholder="Catering inquiry" className="field" required />
        {err("name")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Facebook Page
        <select name="accountId" className="field">
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {err("accountId")}
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Ask for</legend>
        {[
          ["FULL_NAME", "Full name"],
          ["EMAIL", "Email"],
          ["PHONE", "Phone"],
        ].map(([k, l]) => (
          <label key={k} className="flex items-center gap-3 text-sm">
            <input type="checkbox" name={`q_${k}`} value="yes" defaultChecked className="size-4" />
            {l}
          </label>
        ))}
        {err("questions")}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your own questions <span className="text-ink-3 font-normal">(one per line, short answers)</span>
        <textarea name="custom" rows={3} placeholder={"How many people?\nWhich date?"} className="field min-h-20 py-2" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Privacy policy link
        <input name="privacyPolicyUrl" placeholder="https://harbourbean.ph/privacy" className="field" required />
        {err("privacyPolicyUrl")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Thank-you message
        <input name="thankYou" placeholder="Thanks! We'll message you within the day." className="field" />
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="verifyPhone" value="yes" className="size-4" />
        Ask to confirm the phone number by text
      </label>
      <p className="meta">
        Every form ends with an optional box: “I agree to get messages from you on WhatsApp”. Only
        people who tick it get broadcasts and sequences.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending || !pages.length}>
          {pending ? "Creating…" : "Create form"}
        </Button>
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
