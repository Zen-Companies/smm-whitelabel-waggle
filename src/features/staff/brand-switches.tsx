import { BRAND_SWITCHES, switchedOnBrands, type BrandSwitchKey } from "@/lib/flags/brand-switch";
import { getServiceClient } from "@/lib/supabase/service";
import { SwitchOffForm, SwitchOnForm } from "./switch-forms";

/** Staff → Feature switches: a paid channel, switched on brand by brand until billing is built. */
export async function BrandSwitches({ switchKey }: { switchKey: BrandSwitchKey }) {
  const { title, note } = BRAND_SWITCHES[switchKey];
  const db = getServiceClient();
  const [on, { data: brands }] = await Promise.all([
    switchedOnBrands(db, switchKey),
    db.from("tenants").select("id, name").is("offboarded_at", null).order("name").limit(500),
  ]);
  const onIds = new Set(on.map((b) => b.id));
  const headingId = `switch-${switchKey}`;
  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="section-title">
        {title}
      </h2>
      <p className="text-ink-2 text-sm">{note}</p>
      {on.length ? (
        <ul className="divide-line flex flex-col divide-y">
          {on.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{b.name}</span>
              <SwitchOffForm switchKey={switchKey} tenantId={b.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">No brand has {title} yet.</p>
      )}
      <SwitchOnForm
        switchKey={switchKey}
        title={title}
        brands={(brands ?? []).filter((b) => !onIds.has(b.id))}
      />
    </section>
  );
}
