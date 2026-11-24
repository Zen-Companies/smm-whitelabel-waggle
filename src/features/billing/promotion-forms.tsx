"use client";

import { Check } from "lucide-react";
import { Fragment, useActionState, useState } from "react";
import { Switch } from "@/components/app/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createPromotion,
  setPromotionEnabled,
  updatePromotion,
  type PromotionFormState,
} from "./promotion-actions";
import { bothZones, utcToWall, wallToUtc, type PromotionFields } from "./promotion-records";
import { parseBarText, splitLastWord, type BarLine } from "./promotions";

// Staff → Promotions (docs/plans/promotions.md, 24 Nov), on the Staff → Plans pattern. Feedback
// in place, never a toast (design.md §4).

function Feedback({
  state,
  pending,
  saved,
  idle,
}: {
  state: PromotionFormState;
  pending: boolean;
  saved: string;
  idle?: React.ReactNode;
}) {
  if (state.saved && !pending) {
    return (
      <span role="status" className="inline-flex items-center gap-1">
        <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
        {saved}
      </span>
    );
  }
  if (state.error) {
    return (
      <span role="alert" className="text-danger">
        {state.error}
      </span>
    );
  }
  return <>{idle}</>;
}

/** The on/off switch: submits right away, says what happened next to it. */
export function PromotionToggle({
  id,
  name,
  enabled,
}: {
  id: string;
  name: string;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState<PromotionFormState, FormData>(
    setPromotionEnabled,
    {},
  );
  const [on, setOn] = useState(enabled);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {/* The switch submits what it turns to ("on" or "off"). */}
      <Switch
        type="submit"
        name="enabled"
        value={on ? "off" : "on"}
        on={on}
        disabled={pending}
        label={`${name}: on`}
        onClick={() => setOn(!on)}
      />
      {state.error && (
        <span role="alert" className="text-danger text-xs">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** New promotion: kind, short name, name. Created off; then its edit page. */
export function PromotionCreateForm() {
  const [state, action, pending] = useActionState<PromotionFormState, FormData>(
    createPromotion,
    {},
  );
  return (
    <form action={action} className="card flex flex-col gap-3">
      <b className="font-display text-lg font-semibold">New promotion</b>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Kind
          <select name="kind" defaultValue="seasonal" className="field">
            <option value="seasonal">Seasonal (Black Friday…)</option>
            <option value="referral">Referral program</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <Input name="name" placeholder="Christmas 2026" maxLength={60} required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Short name
          <Input name="id" placeholder="christmas-2026" maxLength={40} required />
        </label>
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </div>
      <span className="meta">
        <Feedback
          state={state}
          pending={pending}
          saved="Created."
          idle="It starts off. Fill it in, then switch it on."
        />
      </span>
    </form>
  );
}

// ---- The edit form ----

type Values = {
  [K in keyof PromotionFields]: PromotionFields[K] extends boolean ? boolean : string;
};

function toValues(f: PromotionFields): Values {
  const wall = (v: string | null) => (v ? utcToWall(new Date(v)) : "");
  return {
    ...f,
    starts_at: wall(f.starts_at),
    ends_at: wall(f.ends_at),
    last_day_starts_at: wall(f.last_day_starts_at),
    trial_days: String(f.trial_days),
    reward_months: String(f.reward_months),
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="meta text-xs">{hint}</span>}
    </label>
  );
}

function zones(wall: string): string {
  if (!wall) return "Empty: no date.";
  const d = wallToUtc(wall);
  return d ? bothZones(d) : "Not a date yet.";
}

function BarPreview({ label, lines, cta }: { label: string; lines: BarLine[]; cta: string }) {
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-lg bg-[#0d0b08] px-3.5 py-[9px] text-[13px] font-medium text-[#fff6e6]">
      <span className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap">
        <b className="text-honey text-[11px] tracking-[2px] uppercase">{label || "Label"}</b>
        {lines.map((l, i) => (
          <Fragment key={i}>
            <span aria-hidden className="text-honey px-3 opacity-55">
              ⬢
            </span>
            <span>
              {l.text}
              {l.honey && <span className="text-honey">{l.honey}</span>}
            </span>
          </Fragment>
        ))}
      </span>
      <span className="text-honey shrink-0 font-bold whitespace-nowrap">{cta}</span>
    </div>
  );
}

function PassPreview({
  dayName,
  headline,
  small,
  chip,
  trialDays,
}: {
  dayName: [string, string];
  headline: string;
  small: string;
  chip: string | null;
  trialDays: string;
}) {
  const [lead, honey] = splitLastWord(headline);
  return (
    <div className="promo-pass-shadow">
      <div className="promo-pass flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:gap-[22px]">
        <span className="font-display shrink-0 text-[28px] leading-[0.86] font-bold tracking-[-1.5px] uppercase">
          <span className="block">{dayName[0] || "Day"}</span>
          <span className="promo-outline block">{dayName[1] || "Name"}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {chip && (
            <span className="bg-honey text-ink self-start rounded-full px-[9px] py-[3px] text-[10.5px] font-bold tracking-[1px] uppercase">
              {chip}
            </span>
          )}
          <b className="font-display text-[20px] leading-[1.2] font-bold">
            {lead}
            <span className="text-honey">{honey}</span>
          </b>
          <span className="text-[12.5px] text-[#d9ccb0]">{small}</span>
        </div>
        <span className="font-display text-honey text-[34px] leading-none font-bold tracking-[-2px]">
          +{trialDays || "?"}
          <span className="ml-[3px] text-[13px] tracking-normal">days</span>
        </span>
      </div>
    </div>
  );
}

const AUDIENCE_LABELS = {
  never_paid_owners: "Owners who never paid",
  all_owners: "All Owners (paid too)",
  everyone: "Everyone signed in",
} as const;

/** Every field of one promotion, with a live preview of the bar and the Your plan pass. */
export function PromotionEditForm({
  initial,
  lastChanged,
}: {
  initial: PromotionFields;
  lastChanged: string | null;
}) {
  const [state, action, pending] = useActionState<PromotionFormState, FormData>(
    updatePromotion,
    {},
  );
  const [v, setV] = useState<Values>(() => toValues(initial));
  const [face, setFace] = useState<"main" | "last">("main");
  const set =
    <K extends keyof Values>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setV((o) => ({ ...o, [k]: e.target.value }));
  const flip = (k: "countdown" | "bar_enabled") => () => setV((o) => ({ ...o, [k]: !o[k] }));

  const text = (k: keyof Values, max: number, placeholder?: string) => (
    <Input
      name={k}
      value={v[k] as string}
      onChange={set(k)}
      maxLength={max}
      placeholder={placeholder}
    />
  );
  const area = (k: keyof Values, max: number, rows = 3) => (
    <textarea
      name={k}
      value={v[k] as string}
      onChange={set(k)}
      maxLength={max}
      rows={rows}
      className="field min-h-20 py-2.5"
    />
  );
  const date = (k: "starts_at" | "ends_at" | "last_day_starts_at") => (
    <Input
      type="datetime-local"
      step={1}
      name={k}
      value={v[k]}
      onChange={set(k)}
      className="tabular-nums"
    />
  );
  const sw = (k: "countdown" | "bar_enabled", label: string) => (
    <span className="flex items-center gap-2 text-sm font-medium">
      {v[k] && <input type="hidden" name={k} value="on" />}
      <Switch type="button" on={v[k]} label={label} onClick={flip(k)} />
      {label}
    </span>
  );

  const last = face === "last" && !!v.last_day_starts_at;
  const endsAt = v.ends_at ? wallToUtc(v.ends_at) : null;
  const chip = v.countdown && endsAt ? "Ends in N days" : null;
  const group = "border-line flex flex-col gap-4 border-t px-5 py-5";
  const head = "meta text-xs font-semibold tracking-wide uppercase";
  const seasonal = v.kind === "seasonal";

  return (
    <form action={action} className="card overflow-hidden p-0">
      <input type="hidden" name="id" value={v.id} />
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col">
          <div className={group}>
            <span className={head}>Promotion</span>
            {/* On/off is the switch above the form (it saves at once), not a form field. */}
            <Field label="Name">{text("name", 60)}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts (US Eastern)" hint={zones(v.starts_at)}>
                {date("starts_at")}
              </Field>
              <Field label="Ends (US Eastern)" hint={zones(v.ends_at)}>
                {date("ends_at")}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trial days" hint="Free days on the first plan checkout, 1–90.">
                <Input
                  name="trial_days"
                  inputMode="numeric"
                  value={v.trial_days}
                  onChange={set("trial_days")}
                  className="w-24 tabular-nums"
                />
              </Field>
              {seasonal ? (
                <span className="flex items-end pb-2">
                  {sw("countdown", "Show “Ends in N days”")}
                </span>
              ) : (
                <Field
                  label="Reward months"
                  hint="Months off for the friend who shared the link, after the new friend's first payment. 0 pauses rewards."
                >
                  <Input
                    name="reward_months"
                    inputMode="numeric"
                    value={v.reward_months}
                    onChange={set("reward_months")}
                    className="w-24 tabular-nums"
                  />
                </Field>
              )}
            </div>
            {seasonal && <input type="hidden" name="reward_months" value={v.reward_months} />}
          </div>

          <div className={group}>
            <span className={head}>Top bar</span>
            <div className="flex flex-wrap items-center gap-6">
              {sw("bar_enabled", "Show the bar")}
              <label className="flex items-center gap-2 text-sm font-medium">
                Who sees it
                <select
                  name="audience"
                  value={v.audience}
                  onChange={set("audience")}
                  className="field"
                >
                  {Object.entries(AUDIENCE_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Field label="Label" hint="The honey word first, like BLACK FRIDAY.">
              {text("bar_label", 40)}
            </Field>
            <Field
              label="Lines (computer)"
              hint="One line each. Wrap an ending in *stars* to make it honey."
            >
              {area("bar_text", 400)}
            </Field>
            <Field label="Lines (phone)" hint="Shorter. One line each.">
              {area("bar_phone_text", 200, 2)}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Link text">{text("bar_cta", 30)}</Field>
              <Field label="Phone link text">{text("bar_phone_cta", 20)}</Field>
              <Field
                label="Link"
                hint="plan-popup opens the plan pop-up, or an app path like /plan."
              >
                {text("bar_link", 120)}
              </Field>
            </div>
          </div>

          <div className={group}>
            <span className={head}>Your plan pass</span>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Day name, first line">{text("day_name_1", 20, "Black")}</Field>
              <Field label="Day name, second line">{text("day_name_2", 20, "Friday")}</Field>
            </div>
            <Field label="Headline" hint="The last word shows in honey.">
              {text("headline", 80)}
            </Field>
            <Field
              label="Small line"
              hint={seasonal ? undefined : "{name} is the business that shared the link."}
            >
              {text("subline", 160)}
            </Field>
          </div>

          <div className={group}>
            <span className={head}>Last day (optional)</span>
            <Field
              label="Last day starts (US Eastern)"
              hint={
                v.last_day_starts_at
                  ? zones(v.last_day_starts_at)
                  : "Empty: no last-day face. Set it for a Cyber Monday style last day."
              }
            >
              {date("last_day_starts_at")}
            </Field>
            <Field label="Bar label">{text("last_bar_label", 40, "Cyber Monday")}</Field>
            <Field label="Bar lines (computer)">{area("last_bar_text", 400)}</Field>
            <Field label="Bar lines (phone)">{area("last_bar_phone_text", 200, 2)}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Day name, first line">{text("last_day_name_1", 20, "Cyber")}</Field>
              <Field label="Day name, second line">{text("last_day_name_2", 20, "Monday")}</Field>
            </div>
            <Field label="Headline">{text("last_headline", 80)}</Field>
            <Field label="Small line">{text("last_subline", 160)}</Field>
          </div>
        </div>

        <aside className="border-line bg-subtle flex flex-col gap-4 border-t px-5 py-5 lg:border-t-0 lg:border-l">
          <div className="flex flex-col gap-4 lg:sticky lg:top-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={head}>Preview</span>
              {v.last_day_starts_at && (
                <span className="flex gap-1 text-xs">
                  {(["main", "last"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFace(f)}
                      aria-pressed={face === f}
                      className={
                        face === f
                          ? "bg-ink text-surface rounded-full px-2.5 py-1 font-semibold"
                          : "text-ink-2 rounded-full px-2.5 py-1"
                      }
                    >
                      {f === "main" ? "Before" : "Last day"}
                    </button>
                  ))}
                </span>
              )}
            </div>
            <span className="meta text-xs">
              Top bar, computer{v.bar_enabled ? "" : " (off: nobody sees it)"}
            </span>
            <BarPreview
              label={last ? v.last_bar_label : v.bar_label}
              lines={parseBarText(last ? v.last_bar_text : v.bar_text)}
              cta={v.bar_cta}
            />
            <span className="meta text-xs">Top bar, phone</span>
            <div className="max-w-[360px]">
              <BarPreview
                label={last ? v.last_bar_label : v.bar_label}
                lines={parseBarText(last ? v.last_bar_phone_text : v.bar_phone_text)}
                cta={v.bar_phone_cta}
              />
            </div>
            <span className="meta text-xs">Your plan</span>
            <PassPreview
              dayName={last ? [v.last_day_name_1, v.last_day_name_2] : [v.day_name_1, v.day_name_2]}
              headline={last ? v.last_headline : v.headline}
              small={(last ? v.last_subline : v.subline).replace("{name}", "Harbour Bean Café")}
              chip={last && chip ? "Ends tonight" : chip}
              trialDays={v.trial_days}
            />
          </div>
        </aside>
      </div>
      <div className="border-line bg-subtle flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5">
        <span className="meta">
          <Feedback
            state={state}
            pending={pending}
            saved="Saved. The app shows it within a minute."
            idle={
              <>
                {lastChanged ? `Last changed ${lastChanged} · ` : ""}Changes reach the app within a
                minute.
              </>
            }
          />
        </span>
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
