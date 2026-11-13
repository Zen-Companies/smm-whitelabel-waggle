"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  AdAccount,
  AdCampaignStatus,
  AdCampaignSummary,
  AdRuleSummary,
} from "@/lib/social/types";
import {
  addCpcRuleAction,
  boostPostAction,
  changeRuleAction,
  setCampaignStatusAction,
  type AdsState,
} from "./actions";
import { BOOST_GOALS, MAX_BOOST_DAYS, money, type BoostGoal } from "./boost";

const STATUS: Record<AdCampaignStatus, { label: string; tone: string }> = {
  active: { label: "Running", tone: "bg-success-soft text-success" },
  pending_review: { label: "In review", tone: "bg-honey-tint text-honey-text" },
  paused: { label: "Paused", tone: "bg-subtle text-ink-3" },
  completed: { label: "Ended", tone: "bg-subtle text-ink-3" },
  cancelled: { label: "Stopped", tone: "bg-subtle text-ink-3" },
  rejected: { label: "Not approved", tone: "bg-danger-soft text-danger" },
  error: { label: "Needs a look", tone: "bg-danger-soft text-danger" },
};

const COUNTRIES: [string, string][] = [
  ["PH", "Philippines"],
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["SG", "Singapore"],
  ["MY", "Malaysia"],
  ["AE", "United Arab Emirates"],
  ["IE", "Ireland"],
];

const n = (v: number) => v.toLocaleString("en");

/** One boost: budget, results so far, and Pause / Resume. */
export function CampaignRow({ c, canEdit }: { c: AdCampaignSummary; canEdit: boolean }) {
  const [state, act, pending] = useActionState<AdsState, FormData>(setCampaignStatusAction, {});
  const s = STATUS[c.status];
  const cur = c.currency ?? "USD";
  const budget = c.budget
    ? `${money(c.budget.amount, cur)}${c.budget.type === "daily" ? "/day" : " total"}`
    : null;
  const results =
    c.spend > 0 || c.reach > 0
      ? `${money(c.spend, cur)} spent · ${n(c.reach)} reached · ${n(c.clicks)} clicks`
      : c.status === "pending_review"
        ? "Waiting for Meta to review"
        : null;
  const next = c.status === "active" ? "paused" : c.status === "paused" ? "active" : null;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <b className="truncate font-semibold">{c.name}</b>
        <span className="meta">{[budget, results].filter(Boolean).join(" · ")}</span>
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </div>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.tone}`}>
        {s.label}
      </span>
      {canEdit && next && (
        <form action={act}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="status" value={next} />
          <Button type="submit" variant="quiet" disabled={pending}>
            {next === "paused" ? "Pause" : "Resume"}
          </Button>
        </form>
      )}
    </li>
  );
}

export type BoostablePost = { value: string; label: string };

/** Boost a post (design "Boost this post"): goal, who, budget, then confirm in place. */
export function BoostForm({
  posts,
  accounts,
  leadForms,
  idempotencyKey,
}: {
  posts: BoostablePost[];
  accounts: AdAccount[];
  leadForms: { id: string; name: string }[];
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<AdsState, FormData>(boostPostAction, {});
  const usable = accounts.filter((a) => a.usable);
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [goal, setGoal] = useState<BoostGoal>("reach");
  const [daily, setDaily] = useState("");
  const [days, setDays] = useState("3");
  const [sure, setSure] = useState(false);
  const account = usable.find((a) => a.id === accountId);
  const total = Number(daily) * Number(days);
  const err = (f: string) =>
    state.field === f && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  if (state.savedAt && !state.error) {
    return (
      <p role="status" className="card p-5">
        Sent to Meta for review. It starts once Meta approves it, usually within a day.
      </p>
    );
  }
  if (!posts.length) {
    return (
      <p className="card text-ink-2 p-5">
        Publish a post on Facebook or Instagram first, then boost it here.
      </p>
    );
  }
  return (
    <form action={action} className="card flex flex-col gap-4 p-5" onChange={() => setSure(false)}>
      <h2 className="section-title">Boost a post</h2>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Post
        <select name="post" className="field">
          {posts.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {err("post")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Ad account
        <select
          name="adAccountId"
          className="field"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {usable.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
        {err("adAccountId")}
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">What do you want</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(BOOST_GOALS) as BoostGoal[]).map((g) => (
            <label
              key={g}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm ${goal === g ? "border-ink bg-ink text-surface" : "border-line-strong"}`}
            >
              <input
                type="radio"
                name="goal"
                value={g}
                checked={goal === g}
                onChange={() => setGoal(g)}
                className="sr-only"
              />
              {BOOST_GOALS[g]}
            </label>
          ))}
        </div>
        {err("goal")}
      </fieldset>
      {goal === "visits" && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Page to send people to
          <input name="linkUrl" placeholder="https://harbourbean.ph/menu" className="field" />
          {err("linkUrl")}
        </label>
      )}
      {goal === "messages" && (
        <p className="meta">
          The ad opens a chat with you on Messenger or Instagram, wherever the post is.
        </p>
      )}
      {goal === "leads" && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Lead form
          <select name="leadFormId" className="field">
            {leadForms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {!leadForms.length && (
            <span className="meta">Make a form in Contacts → Ad leads first.</span>
          )}
          {err("leadFormId")}
        </label>
      )}
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="mb-1 text-sm font-medium">Who sees it</legend>
        <label className="flex flex-col gap-1.5 text-sm">
          Country
          <select name="country" className="field w-56" defaultValue="PH">
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Age from
          <input
            name="ageMin"
            type="number"
            min={18}
            max={65}
            defaultValue={18}
            className="field w-24"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          to
          <input
            name="ageMax"
            type="number"
            min={18}
            max={65}
            defaultValue={65}
            className="field w-24"
          />
        </label>
      </fieldset>
      {err("country")}
      {err("age")}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Budget per day{account ? ` (${account.currency})` : ""}
          <input
            name="daily"
            type="number"
            min={account?.minDailyBudget ?? 1}
            step={1}
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            placeholder={String(account?.minDailyBudget ?? 300)}
            className="field w-36"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          For (days)
          <input
            name="days"
            type="number"
            min={1}
            max={MAX_BOOST_DAYS}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="field w-24"
          />
        </label>
        {account && total > 0 && (
          <p className="text-sm">
            Total up to <b>{money(total, account.currency)}</b>, charged by Meta to your ad account.
            Waggle adds nothing on top.
          </p>
        )}
      </div>
      {err("daily")}
      {err("days")}
      {sure ? (
        <div className="border-honey-border bg-honey-tint flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
          <b className="font-semibold">
            Send this boost to Meta? Up to {account ? money(total, account.currency) : ""} will be
            charged once it runs.
          </b>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Sending…" : "Send to Meta for review"}
          </Button>
          <Button type="button" variant="quiet" onClick={() => setSure(false)}>
            Not yet
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="primary"
          className="self-start"
          disabled={!account || !(total > 0)}
          onClick={() => setSure(true)}
        >
          Boost this post
        </Button>
      )}
      <p className="meta">Meta reviews every ad, usually within a day. It starts once approved.</p>
      {state.error && !state.field && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Safety rules: the rules the brand has, on/off and delete, and "pause if a click costs more". */
export function SafetyRules({
  rules,
  accounts,
  canEdit,
}: {
  rules: AdRuleSummary[];
  accounts: AdAccount[];
  canEdit: boolean;
}) {
  const [state, add, adding] = useActionState<AdsState, FormData>(addCpcRuleAction, {});
  const [change, act, changing] = useActionState<AdsState, FormData>(changeRuleAction, {});
  const currency = accounts[0]?.currency ?? "";
  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="rules-title">
      <h2 id="rules-title" className="section-title">
        Safety rules
      </h2>
      {rules.length ? (
        <ul className="divide-line flex flex-col divide-y">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="flex-1">{r.name}</span>
              <span className={r.enabled ? "text-success font-semibold" : "text-ink-3"}>
                {r.enabled ? "On" : "Off"}
              </span>
              {canEdit && (
                <form action={act} className="flex gap-1">
                  <input type="hidden" name="id" value={r.id} />
                  <Button
                    type="submit"
                    name="op"
                    value={r.enabled ? "off" : "on"}
                    variant="quiet"
                    disabled={changing}
                  >
                    {r.enabled ? "Turn off" : "Turn on"}
                  </Button>
                  <Button
                    type="submit"
                    name="op"
                    value="delete"
                    variant="quiet"
                    disabled={changing}
                  >
                    Delete
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2 text-sm">
          No rules yet. Add one so a boost can&apos;t run away with your budget.
        </p>
      )}
      {change.error && (
        <p role="alert" className="text-danger text-sm">
          {change.error}
        </p>
      )}
      {canEdit && accounts.length > 0 && (
        <form action={add} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="adAccountId" value={accounts[0].id} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Pause a boost if a click costs more than{currency ? ` (${currency})` : ""}
            <input
              name="maxCpc"
              type="number"
              min={1}
              step="any"
              placeholder="25"
              className="field w-32"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={adding}>
            Add rule
          </Button>
          {state.error && (
            <p role="alert" className="text-danger w-full text-sm">
              {state.error}
            </p>
          )}
        </form>
      )}
      <p className="meta">Checked every hour, once a boost has 5 clicks that day.</p>
    </section>
  );
}
