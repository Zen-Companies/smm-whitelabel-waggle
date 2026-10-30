import { defaultAiCap, loadAiSpend } from "@/lib/llm/spend";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { CapForm } from "./cap-form";
import { loadCostView } from "./costs";
import { requireOperator } from "./operator";

const usd = (n: number | null, digits = 4) =>
  n === null
    ? "–"
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
const date = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Operator page: AI cost per business and per message, plus Zernio's spend per business. */
export async function CostView() {
  await requireOperator();
  const db = getServiceClient();
  const [view, spend] = await Promise.all([
    loadCostView({ db, social: getSocialProvider }),
    loadAiSpend(db, new Date()),
  ]);
  const defaultCap = defaultAiCap();
  const LEVEL = { ok: "", warn: "Over 80%", reached: "Cap reached: not drafting" } as const;

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["AI cost, last 30 days", usd(view.totals.aiCostUsd)],
          ["Messages", view.totals.messages.toLocaleString()],
          [
            "AI cost per message",
            view.totals.messages ? usd(view.totals.aiCostUsd / view.totals.messages, 5) : "–",
          ],
          ["Zernio, this cycle", view.zernio ? usd(view.zernio.totalUsd, 2) : "Not available"],
        ].map(([label, value]) => (
          <div key={label} className="card flex flex-col gap-1 p-4">
            <dt className="meta">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {!view.zernio && (
        <p className="meta">
          Zernio usage isn&apos;t available here (local demo, or Zernio didn&apos;t answer). AI
          costs are complete.
        </p>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="by-business">
        <h2 id="by-business" className="section-title">
          By business
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="meta text-left">
              <tr className="border-b">
                <th className="p-3 font-medium">Business</th>
                <th className="p-3 text-right font-medium">Messages</th>
                <th className="p-3 text-right font-medium">Replies sent</th>
                <th className="p-3 text-right font-medium">AI calls</th>
                <th className="p-3 text-right font-medium">AI cost</th>
                <th className="p-3 text-right font-medium">Per message</th>
                <th className="p-3 text-right font-medium">Zernio (cycle)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {view.tenants.map((t) => (
                <tr key={t.tenantId} className="border-b last:border-0">
                  <td className="p-3">{t.name}</td>
                  <td className="p-3 text-right">{t.messages}</td>
                  <td className="p-3 text-right">{t.repliesSent}</td>
                  <td className="p-3 text-right">{t.aiCalls}</td>
                  <td className="p-3 text-right">{usd(t.aiCostUsd)}</td>
                  <td className="p-3 text-right">{usd(t.aiCostPerMessageUsd, 5)}</td>
                  <td className="p-3 text-right">{usd(t.zernioCostUsd, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {view.zernio && (
          <p className="meta">
            Zernio cycle {view.zernio.periodStart ?? "?"} to {view.zernio.periodEnd ?? "?"}; not
            tied to a business (credits, verification): {usd(view.zernio.unattributedUsd, 2)}.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="allowance">
        <h2 id="allowance" className="section-title">
          Monthly AI cap
        </h2>
        <p className="meta">
          Live and practice calls this calendar month (UTC); lab calls don&apos;t count. At the cap,
          messages are still sorted but no reply is drafted; they go to Needs you. Blank uses the
          default (${defaultCap}, AI_MONTHLY_CAP_USD).
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="meta text-left">
              <tr className="border-b">
                <th className="p-3 font-medium">Business</th>
                <th className="p-3 text-right font-medium">This month</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 text-right font-medium">Cap (USD)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {view.tenants.map((t) => {
                const s = spend.get(t.tenantId);
                if (!s) return null;
                return (
                  <tr key={t.tenantId} className="border-b last:border-0">
                    <td className="p-3">{t.name}</td>
                    <td className="p-3 text-right">
                      {usd(s.spentUsd)} of {usd(s.capUsd, 2)}
                    </td>
                    <td className="p-3">{LEVEL[s.level]}</td>
                    <td className="p-3">
                      <CapForm
                        tenantId={t.tenantId}
                        name={t.name}
                        cap={s.customCap ? s.capUsd : null}
                        defaultCap={defaultCap}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="by-message">
        <h2 id="by-message" className="section-title">
          Latest messages
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="meta text-left">
              <tr className="border-b">
                <th className="p-3 font-medium">Received</th>
                <th className="p-3 font-medium">Business</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">AI calls</th>
                <th className="p-3 text-right font-medium">AI cost</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {view.items.map((i) => (
                <tr key={i.itemId} className="border-b last:border-0">
                  <td className="p-3">{date(i.receivedAt)}</td>
                  <td className="p-3">{i.tenantName}</td>
                  <td className="p-3">
                    {i.kind === "dm" ? "DM" : "Comment"}
                    {i.category ? ` · ${i.category}` : ""}
                  </td>
                  <td className="p-3">{i.status.replace("_", " ")}</td>
                  <td className="p-3">
                    {i.aiCalls} {i.purposes.length ? `(${i.purposes.join(", ")})` : ""}
                  </td>
                  <td className="p-3 text-right">{usd(i.aiCostUsd, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
