import { notFound } from "next/navigation";
import { hasPermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { BrandsLimitForm } from "./brands-limit-form";
import { PLANS, type PlanId } from "./plans";
import { loadBrandLimits } from "./usage";

const IDS: PlanId[] = ["solo", "business", "team"];

/**
 * Staff → Plans: the Pricing Bible's plans as the app holds them, and the one setting staff
 * change here, brands per plan (decided 17 Nov). Prices live in the Bible; only Jason changes one.
 */
export async function PlansView() {
  if (!(await hasPermission("admin.caps.manage"))) notFound();
  const limits = await loadBrandLimits(getServiceClient());
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-ink-3 border-line border-b text-left text-xs uppercase">
            <th className="px-4 py-3 font-semibold">Plan</th>
            <th className="px-4 py-3 font-semibold">Price</th>
            <th className="px-4 py-3 font-semibold">Accounts</th>
            <th className="px-4 py-3 font-semibold">AI replies a month</th>
            <th className="px-4 py-3 font-semibold">Team members</th>
            <th className="px-4 py-3 text-right font-semibold">Brands included</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {IDS.map((id) => {
            const p = PLANS[id];
            return (
              <tr key={id}>
                <td className="px-4 py-3">
                  <b className="font-semibold">{p.name}</b>
                  {!p.forSale && <span className="text-ink-3"> · coming soon</span>}
                </td>
                <td className="px-4 py-3 tabular-nums">${p.monthlyUsd} a month</td>
                <td className="px-4 py-3 tabular-nums">{p.accounts}</td>
                <td className="px-4 py-3 tabular-nums">
                  About {p.replies.toLocaleString("en-US")}
                </td>
                <td className="px-4 py-3">{p.features.team ? "Yes" : "No"}</td>
                <td className="px-4 py-3">
                  <BrandsLimitForm plan={id} name={p.name} limit={limits[id]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
