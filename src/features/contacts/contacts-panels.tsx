"use client";

import { useActionState, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/lib/social/types";
import { addContact, importContacts, updateContact, type ContactFormState } from "./actions";

/** Add one person, or import a CSV (T78a). */
export function ContactsActions({ hasWhatsApp }: { hasWhatsApp: boolean }) {
  const [open, setOpen] = useState<"add" | "import" | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={() => setOpen(open === "add" ? null : "add")}>
          Add a person
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(open === "import" ? null : "import")}>
          Import a CSV
        </Button>
      </div>
      {open === "add" && <AddForm hasWhatsApp={hasWhatsApp} onDone={() => setOpen(null)} />}
      {open === "import" && <ImportForm hasWhatsApp={hasWhatsApp} />}
    </div>
  );
}

function AddForm({ hasWhatsApp, onDone }: { hasWhatsApp: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(async (p, d) => {
    const next = await addContact(p, d);
    if (next.savedAt && !next.error) onDone();
    return next;
  }, {});
  const err = (f: string) =>
    state.field === f && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <h2 className="section-title">Add a person</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input name="name" className="field" required />
          {err("name")}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Phone <span className="text-ink-3 font-normal">(with country code)</span>
          <input name="phone" placeholder="+63 917 555 0142" className="field" />
          {err("phone")}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email <span className="text-ink-3 font-normal">(optional)</span>
          <input name="email" type="email" className="field" />
          {err("email")}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Tags <span className="text-ink-3 font-normal">(comma separated)</span>
          <input name="tags" placeholder="regular, catering" className="field" />
        </label>
      </div>
      {!hasWhatsApp && <p className="meta">Connect WhatsApp to message people by phone.</p>}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" value="yes" className="mt-0.5 size-4" />
        They agreed to get messages from us (offers, updates).
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          Cancel
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

function ImportForm({ hasWhatsApp }: { hasWhatsApp: boolean }) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(importContacts, {});
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <h2 className="section-title">Import a CSV</h2>
      <p className="text-ink-2 text-sm">
        The first row names the columns: <b>name</b>, <b>phone</b>, and if you have them <b>email</b> and{" "}
        <b>tags</b> (separate tags with ;). Up to 1,000 people.
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        File
        <input name="file" type="file" accept=".csv,text/csv" className="field py-2" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Or paste it here
        <textarea name="csv" rows={4} placeholder={"name,phone,tags\nAna Reyes,+63 917 555 0142,regular"} className="field min-h-24 py-2 font-mono text-xs" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Numbers without a + are from country code
          <input name="countryCode" placeholder="63" inputMode="numeric" className="field" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Add these tags to everyone
          <input name="tags" placeholder="imported-nov" className="field" />
        </label>
      </div>
      {!hasWhatsApp && <p className="meta">Connect WhatsApp first to message them by phone; they&apos;re added either way.</p>}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" value="yes" className="mt-0.5 size-4" />
        Everyone in this file agreed to get messages from us. Without this, they&apos;re tagged
        “not-subscribed” and left out of broadcasts.
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </Button>
        {state.imported && (
          <p role="status" className="text-sm">
            Added {state.imported.created}.{state.imported.skipped ? ` ${state.imported.skipped} skipped (no name or number, or already here).` : ""}
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

/** One person: where they can be reached, tags, and whether they agreed to messages. */
export function ContactRow({ c, canEdit }: { c: Contact; canEdit: boolean }) {
  const [state, act, pending] = useActionState<ContactFormState, FormData>(updateContact, {});
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {c.platform ? (
        <PlatformMark platform={c.platform} size={26} />
      ) : (
        <span aria-hidden className="bg-subtle size-[26px] rounded-full" />
      )}
      <span className="flex min-w-[200px] flex-1 flex-col">
        <b className="font-semibold">{c.name || "No name"}</b>
        <span className="meta truncate">
          {[c.identifier, c.email].filter(Boolean).join(" · ") || "No way to message yet"}
        </span>
      </span>
      {c.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <span key={t} className="bg-subtle text-ink-2 rounded-full px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </span>
      )}
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.subscribed ? "bg-success-soft text-success" : "bg-subtle text-ink-3"}`}
      >
        {c.subscribed ? "Gets messages" : "Not subscribed"}
      </span>
      {canEdit && (
        <form action={act}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="name" value={c.name} />
          <input type="hidden" name="subscribed" value={c.subscribed ? "no" : "yes"} />
          <Button type="submit" variant="quiet" disabled={pending}>
            {c.subscribed ? "Stop messages" : "They agreed"}
          </Button>
        </form>
      )}
      {state.error && (
        <span role="alert" className="text-danger w-full text-sm">
          {state.error}
        </span>
      )}
    </li>
  );
}
