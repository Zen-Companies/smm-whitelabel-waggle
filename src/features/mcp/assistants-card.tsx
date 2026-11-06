import { CopyButton } from "@/components/app/copy-button";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { AssistantRow } from "./assistant-row";
import { mcpEnabled } from "./auth";
import { loadGrants, loadUserBrands } from "./grants";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Settings → AI assistants (design v3): Waggle's address for Claude, ChatGPT and Grok, and the
 * assistants this login connected. Connections belong to the login, so one can cover several brands.
 */
export async function AssistantsCard() {
  const user = await getCurrentUser();
  const db = getServiceClient();
  const [grants, brands] = await Promise.all([
    loadGrants(db, user.id),
    loadUserBrands(db, user.id),
  ]);
  const address = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/mcp`;
  const on = mcpEnabled();

  return (
    <section className="flex flex-col gap-5" aria-labelledby="assistants-heading">
      <div>
        <h2 id="assistants-heading" className="section-title">
          AI assistants
        </h2>
        <p className="meta">
          Use Waggle from Claude, ChatGPT or Grok: ask what&apos;s in your inbox, approve replies,
          plan posts. Connections belong to your login, so one can cover several brands.
        </p>
      </div>

      <div className="card flex flex-col gap-3 px-5 py-4">
        <span className="font-semibold">Connect a new assistant</span>
        {on ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="mcp-address" className="text-ink-2 basis-full text-sm">
                Waggle&apos;s address for AI assistants
              </label>
              <input
                id="mcp-address"
                readOnly
                value={address}
                className="field min-w-0 flex-[1_1_320px] font-mono text-[13px]"
              />
              <CopyButton text={address} label="Copy" />
            </div>
            <span className="text-ink-2 text-sm">
              Add it as a custom connector in your assistant, then sign in and pick your brands.
            </span>
          </>
        ) : (
          <span className="text-ink-2 text-sm">
            AI assistants aren&apos;t turned on yet. We&apos;re switching this on brand by brand.
          </span>
        )}
      </div>

      <section aria-label="Connected assistants" className="card flex flex-col">
        <div className="flex items-baseline gap-2 px-5 py-4">
          <span className="font-semibold">Connected</span>
          <span className="meta">
            {grants.length === 1 ? "1 assistant" : `${grants.length} assistants`}
          </span>
        </div>
        {grants.length === 0 ? (
          <p className="text-ink-2 border-line border-t px-5 py-4 text-sm">None yet.</p>
        ) : (
          <ul className="divide-line border-line divide-y border-t">
            {grants.map((g) => (
              <AssistantRow
                key={g.clientId}
                clientId={g.clientId}
                clientName={g.clientName || "AI assistant"}
                connectedOn={day(g.createdAt)}
                brands={brands.map((b) => ({ ...b, shared: g.brandIds.includes(b.id) }))}
              />
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
