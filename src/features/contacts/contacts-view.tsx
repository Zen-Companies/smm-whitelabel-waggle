import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { Contact } from "@/lib/social/types";
import { contactsProblem, type ContactsProblem } from "./contacts-problem";
import { createServerSupabase } from "@/lib/supabase/server";
import { ContactRow, ContactsActions } from "./contacts-panels";
import { ContactsTabs } from "./contacts-tabs";

/**
 * Contacts → People (T78a, design "Contacts · list, consent, import"): everyone the business can
 * message. People who message the business are added on their own; owners add or import more.
 */
export async function ContactsView({ q, tag, page }: { q?: string; tag?: string; page: number }) {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { count: wa } = await supabase
    .from("social_accounts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("platform", "whatsapp")
    .eq("status", "active");
  let contacts: Contact[] = [];
  let total = 0;
  let problem: ContactsProblem | null = null;
  if (tenant.zernioProfileId) {
    try {
      ({ contacts, total } = await getSocialProvider().listContacts({
        profileId: tenant.zernioProfileId,
        search: q,
        tag,
        skip: page * 50,
        signal: AbortSignal.timeout(10_000),
      }));
    } catch (error) {
      problem = contactsProblem(error);
      if (problem === "down") {
        Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "listContacts" } });
      }
    }
  }
  const canEdit = can(tenant.role, "replies.approve");
  const href = (p: number) => {
    const s = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(tag ? { tag } : {}),
      ...(p ? { page: String(p) } : {}),
    });
    return `/contacts${s.size ? `?${s}` : ""}`;
  };

  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Contacts</h1>
        <p className="text-ink-2">
          Everyone you can message. People who message you are added on their own.
        </p>
      </div>
      <ContactsTabs active="/contacts" />
      {canEdit && <ContactsActions hasWhatsApp={(wa ?? 0) > 0} />}
      <form className="flex flex-wrap gap-2" role="search">
        <label htmlFor="contacts-q" className="sr-only">
          Search by name
        </label>
        <input
          id="contacts-q"
          name="q"
          defaultValue={q}
          placeholder="Search by name"
          className="field max-w-64"
        />
        <label htmlFor="contacts-tag" className="sr-only">
          Tag
        </label>
        <input
          id="contacts-tag"
          name="tag"
          defaultValue={tag}
          placeholder="Tag"
          className="field max-w-40"
        />
        <button
          type="submit"
          className="border-line-strong hover:bg-subtle rounded-xl border px-4 text-sm font-medium"
        >
          Search
        </button>
      </form>
      {problem === "not_set_up" ? (
        <p className="card text-ink-2 p-5">
          <b className="text-ink font-semibold">
            Contacts aren&apos;t set up for this business yet.
          </b>{" "}
          They appear once an account is connected and people message you.
        </p>
      ) : problem === "down" ? (
        <p className="danger-box">
          Your contacts couldn&apos;t be loaded right now. Try again in a moment.
        </p>
      ) : contacts.length === 0 ? (
        <p className="text-ink-2">
          {q || tag
            ? "No one matches."
            : "No contacts yet. They appear as people message you, or add them above."}
        </p>
      ) : (
        <>
          <p className="meta">
            {total.toLocaleString("en-US")} {total === 1 ? "person" : "people"}
          </p>
          <ul className="card divide-line flex flex-col divide-y">
            {contacts.map((c) => (
              <ContactRow key={c.id} c={c} canEdit={canEdit} />
            ))}
          </ul>
          <div className="flex gap-3 text-sm">
            {page > 0 && <Link href={href(page - 1)}>← Newer</Link>}
            {(page + 1) * 50 < total && <Link href={href(page + 1)}>Older →</Link>}
          </div>
        </>
      )}
      <p className="meta">
        Only people marked “Gets messages” receive broadcasts and sequences. Anyone who unsubscribes
        is stopped automatically.
      </p>
    </div>
  );
}
