"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buyNumberAction,
  releaseNumberAction,
  searchNumbersAction,
  switchPhoneAction,
  type PhoneState,
  type SearchState,
} from "./actions";
import { displayNumber, monthly, typeLabel, type NumberOption } from "./numbers";

const regionName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Get a business number (design "Settings · Phone"): search, choose, confirm in place. */
export function NumberPicker({
  options,
  purchaseIntentId,
}: {
  options: NumberOption[];
  purchaseIntentId: string;
}) {
  const [found, search, searching] = useActionState<SearchState, FormData>(searchNumbersAction, {});
  const [bought, buy, buying] = useActionState<PhoneState, FormData>(buyNumberAction, {});
  const [pick, setPick] = useState(`${options[0]?.country}|${options[0]?.numberType}`);
  const [chosen, setChosen] = useState<string | null>(null);
  const [country, numberType] = pick.split("|");
  const option = options.find((o) => o.country === country && o.numberType === numberType);
  const foundOption = options.find(
    (o) => o.country === found.country && o.numberType === found.numberType,
  );

  if (bought.done) {
    return (
      <p role="status" className="text-success text-sm font-medium">
        {bought.done}
      </p>
    );
  }
  if (!options.length)
    return <p className="text-ink-2 text-sm">No numbers are available right now.</p>;
  return (
    <div className="flex flex-col gap-4">
      <form
        action={search}
        className="flex flex-wrap items-end gap-3"
        onSubmit={() => setChosen(null)}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Number
          <select className="field w-64" value={pick} onChange={(e) => setPick(e.target.value)}>
            {options.map((o) => (
              <option key={`${o.country}|${o.numberType}`} value={`${o.country}|${o.numberType}`}>
                {regionName(o.country)} · {typeLabel(o.numberType)} · {monthly(o.monthlyCents)}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="country" value={country} />
        <input type="hidden" name="numberType" value={numberType} />
        {numberType !== "toll_free" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Area code <span className="text-ink-3 font-normal">(optional)</span>
            <input name="areaCode" inputMode="numeric" placeholder="415" className="field w-32" />
          </label>
        )}
        <Button type="submit" variant="secondary" disabled={searching || !option}>
          {searching ? "Looking…" : "Find numbers"}
        </Button>
      </form>
      {found.error && (
        <p role="alert" className="text-danger text-sm">
          {found.error}
        </p>
      )}
      {found.numbers && foundOption && (
        <ul className="card divide-line flex flex-col divide-y">
          {found.numbers.map((n) => (
            <li key={n.phoneNumber} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="font-semibold tabular-nums">{displayNumber(n.phoneNumber)}</b>
                <span className="meta">
                  {[
                    n.locality,
                    typeLabel(foundOption.numberType),
                    foundOption.sms ? "calls and texts" : "calls",
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {monthly(foundOption.monthlyCents)}
                </span>
              </span>
              {chosen === n.phoneNumber ? (
                <form action={buy} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="country" value={foundOption.country} />
                  <input type="hidden" name="numberType" value={foundOption.numberType} />
                  <input type="hidden" name="phoneNumber" value={n.phoneNumber} />
                  <input type="hidden" name="purchaseIntentId" value={purchaseIntentId} />
                  <span>Get this number for {monthly(foundOption.monthlyCents)}?</span>
                  <Button type="submit" variant="primary" disabled={buying}>
                    {buying ? "Getting it…" : "Get it"}
                  </Button>
                  <Button type="button" variant="quiet" onClick={() => setChosen(null)}>
                    Not this one
                  </Button>
                </form>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setChosen(n.phoneNumber)}>
                  Choose
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {bought.error && (
        <p role="alert" className="text-danger text-sm">
          {bought.error}
        </p>
      )}
    </div>
  );
}

/** Release the number, confirmed in place: it can't be undone. */
export function ReleaseNumber({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<PhoneState, FormData>(releaseNumberAction, {});
  const [sure, setSure] = useState(false);
  if (state.done) return <span className="text-ink-3 text-sm">{state.done}</span>;
  return sure ? (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <span>
        Release {label}? Customers can&apos;t reach you on it any more, and you can&apos;t get it
        back.
      </span>
      <Button type="submit" variant="secondary" disabled={pending}>
        Release it
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
      Release
    </Button>
  );
}

/** Staff: Phone on or off for one brand. */
export function PhoneSwitchForm({
  tenantId,
  on,
  label,
}: {
  tenantId: string;
  on: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState<PhoneState, FormData>(switchPhoneAction, {});
  return (
    <form action={action} className="flex items-center gap-2 text-sm">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="on" value={on ? "true" : "false"} />
      <Button type="submit" variant={on ? "secondary" : "quiet"} disabled={pending}>
        {label}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Staff: pick a brand to switch Phone on for. */
export function PhoneSwitchOn({ brands }: { brands: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<PhoneState, FormData>(switchPhoneAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="on" value="true" />
      <label className="flex flex-col gap-1.5 font-medium">
        Brand
        <select name="tenantId" className="field w-72">
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" disabled={pending || !brands.length}>
        Turn Phone on
      </Button>
      {state.error && (
        <span role="alert" className="text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
