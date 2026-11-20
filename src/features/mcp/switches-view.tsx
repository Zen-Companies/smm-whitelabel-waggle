import { Chip } from "@/components/app/chip";
import { requirePermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { globalSwitch, loadSwitches, SWITCHES_PAGE } from "./admin";
import { mcpEnabled } from "./auth";
import { limitsFromEnv } from "./limits";
import { BrandSwitch, DailyCapForm, EveryoneSwitch } from "./switch-forms";

/** Staff "Switches" (design v3): AI assistants for everyone, then business by business. */
export async function SwitchesView({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requirePermission("flags.manage");
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const db = getServiceClient();
  const [everyone, { rows, more }] = await Promise.all([
    globalSwitch(db),
    loadSwitches(db, q, new Date()),
  ]);
  const limits = limitsFromEnv();
  const th = "px-2.5 py-2 font-medium";
  const td = "px-2.5 py-2";

  return (
    <section className="flex flex-col gap-3" aria-labelledby="ai-assistants">
      <div className="flex flex-col">
        <h2 id="ai-assistants" className="section-title">
          AI assistants
        </h2>
        <p className="meta">
          On for every business. Switch one off in its row, or all at once here.
        </p>
      </div>
      {!mcpEnabled() && (
        <p className="border-honey-border bg-honey-tint rounded-xl border px-4 py-3 text-sm">
          AI assistants are off on this server. A developer turns them on.
        </p>
      )}
      <section className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4.5">
        <span className="flex flex-[1_1_400px] flex-col">
          <b className="font-semibold">AI assistants (MCP), everywhere</b>
          <span className="text-ink-2">
            Off stops every AI assistant at once: tools answer &quot;paused&quot; and nobody can
            connect. Business switches below are kept.
          </span>
        </span>
        <EveryoneSwitch on={everyone} />
      </section>

      <section className="flex flex-col gap-2.5" aria-label="Businesses">
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex flex-[0_1_320px] flex-col gap-1" role="search">
            <label htmlFor="brand-search" className="text-[13px] font-semibold">
              Find a business
            </label>
            <input
              id="brand-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Business name"
              className="field"
            />
          </form>
          <span className="text-ink-2 ml-auto text-[13px]">
            Limits per business: {limits.burstSends} AI sends per 10 minutes, {limits.dailySends} a
            day (raise a business&apos;s daily limit in its row)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="meta text-left text-xs">
              <tr className="border-line border-b">
                <th scope="col" className={th}>
                  Business
                </th>
                <th scope="col" className={th}>
                  Owner
                </th>
                <th scope="col" className={th}>
                  AI assistants
                </th>
                <th scope="col" className={th}>
                  Connected
                </th>
                <th scope="col" className={th}>
                  AI sends, last 24 hours
                </th>
                <th scope="col" className={th}>
                  Daily limit
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cap = r.dailyCap ?? limits.dailySends;
                return (
                  <tr key={r.id} className="border-subtle border-b align-middle">
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <b className="font-semibold">{r.name}</b>
                        {r.isTest && <Chip tone="blue">test</Chip>}
                      </span>
                    </td>
                    <td className={`${td} text-ink-2`}>{r.owner ?? "–"}</td>
                    <td className={td}>
                      <BrandSwitch tenantId={r.id} name={r.name} on={r.on} />
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {r.on || r.connected ? r.connected : "–"}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {r.sendsToday}
                      {r.sendsToday >= cap && (
                        <span className="text-honey-text"> · at the daily limit</span>
                      )}
                    </td>
                    <td className={td}>
                      <DailyCapForm
                        tenantId={r.id}
                        name={r.name}
                        cap={r.dailyCap}
                        defaultCap={limits.dailySends}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="meta">No businesses match.</p>}
        {more && (
          <p className="meta">Showing the first {SWITCHES_PAGE} by name. Search to find others.</p>
        )}
        <p className="meta">
          Turning a business off cuts its connected assistants off right away; they keep the
          connection and work again when it&apos;s back on. Every change is logged.
        </p>
      </section>
    </section>
  );
}
