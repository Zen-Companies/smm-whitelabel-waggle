"use client";

import { Check, CircleAlert } from "lucide-react";
import { Fragment, useActionState, useState } from "react";
import { Chip } from "@/components/app/chip";
import { Button } from "@/components/ui/button";
import { type BrandActionState, offboardAction, restoreAction, retryAction } from "./actions";
import type { BrandRow } from "./brands";

const td = "px-2.5 py-3 align-top";
const date = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

/** The brand rows of the staff Brands page (design v3 "T21 · Staff · Brands"). */
export function BrandRows({ rows }: { rows: BrandRow[] }) {
  return (
    <tbody>
      {rows.map((r) => (
        <BrandRowView key={r.id} row={r} />
      ))}
    </tbody>
  );
}

function BrandRowView({ row }: { row: BrandRow }) {
  const [confirming, setConfirming] = useState(false);
  const [restored, setRestored] = useState(false);
  const offboarded = row.state !== "active";
  // The confirmation shows only while the brand is active (it closes once offboarded).
  const border = confirming && !offboarded ? "" : "border-subtle border-b";

  return (
    <Fragment>
      <tr className={border}>
        <td className={td}>
          <b className={`font-semibold ${offboarded ? "text-ink-2" : ""}`}>{row.name}</b>
          <br />
          <span className="meta">
            {row.offboardedAt
              ? `Offboarded ${date(row.offboardedAt)} by ${row.offboardedBy ?? "a staff member"}`
              : `Since ${date(row.createdAt)}`}
          </span>
        </td>
        <td className={`${td} ${offboarded ? "text-ink-2" : ""}`}>{row.owner ?? "–"}</td>
        <td className={td}>
          <StatusCell row={row} restored={restored} />
        </td>
        <td className={`${td} ${offboarded ? "text-ink-2" : ""}`}>
          {row.accounts.map((a) => (
            <span key={a} className="block">
              {a}
            </span>
          ))}
        </td>
        <td className={`${td} text-right`}>
          {row.state === "active" && !confirming && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setRestored(false);
                setConfirming(true);
              }}
            >
              Offboard
            </Button>
          )}
          {row.state === "offboarded" && (
            <RestoreButton
              tenantId={row.id}
              name={row.name}
              onDone={() => {
                setRestored(true);
                setConfirming(false);
              }}
            />
          )}
          {row.state === "attention" && <RetryButton tenantId={row.id} name={row.name} />}
        </td>
      </tr>
      {confirming && row.state === "active" && (
        <tr className="border-subtle border-b">
          <td colSpan={5} className="px-2.5 pt-1 pb-3.5">
            <OffboardConfirm row={row} onKeep={() => setConfirming(false)} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function StatusCell({ row, restored }: { row: BrandRow; restored: boolean }) {
  if (row.state === "active") {
    return (
      <>
        <Chip tone="green">Active</Chip>
        {restored && (
          <span role="status" className="text-ink-2 mt-1 flex items-start gap-1">
            <Check
              className="text-success mt-0.5 size-3.5 shrink-0"
              strokeWidth={2.5}
              aria-hidden
            />
            Restored just now. The owner needs to reconnect Instagram and Facebook.
          </span>
        )}
      </>
    );
  }
  const left = row.purgeAfter
    ? `Deleted for good on ${date(row.purgeAfter, true)} · ${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"} left`
    : null;
  if (row.state === "attention") {
    return (
      <>
        <Chip tone="red" className="gap-1">
          <CircleAlert className="size-3" strokeWidth={2.5} aria-hidden />
          Needs attention
        </Chip>
        <span className="text-danger mt-1 block">
          {row.issue} Waggle has already stopped for this brand.
        </span>
        {left && <span className="text-ink-2 block">{left}</span>}
      </>
    );
  }
  return (
    <>
      <Chip>Offboarded</Chip>
      {left && <span className="text-ink-2 mt-1 block">{left}</span>}
    </>
  );
}

function OffboardConfirm({ row, onKeep }: { row: BrandRow; onKeep: () => void }) {
  const [state, action, pending] = useActionState<BrandActionState, FormData>(offboardAction, {});
  const purge = new Date();
  purge.setUTCMonth(purge.getUTCMonth() + 3);
  const inputId = `confirm-${row.id}`;
  return (
    <form
      action={action}
      aria-label={`Offboard ${row.name}`}
      className="border-danger/40 bg-danger-soft flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="tenantId" value={row.id} />
      <b className="font-semibold">Offboard {row.name}?</b>
      <ul className="text-ink-2 flex list-disc flex-col gap-1 pl-4.5">
        <li>
          Waggle stops replying and posting for this brand right away, and its Instagram and
          Facebook are disconnected.
        </li>
        <li>
          The owner can&apos;t open the brand any more. Everything is kept until{" "}
          <b className="text-ink font-semibold">{date(purge.toISOString(), true)}</b>, and you can
          restore it until then.
        </li>
        <li>
          After that, messages, drafts, business info, posts and contacts are deleted for good.
          Costs and the audit log stay, without customer names or messages.
        </li>
      </ul>
      <div className="flex flex-wrap items-end gap-2.5">
        <span className="flex flex-[0_1_300px] flex-col gap-1">
          <label htmlFor={inputId} className="text-[13px] font-semibold">
            Type the brand name to confirm
          </label>
          <input
            id={inputId}
            name="confirm"
            autoComplete="off"
            required
            className="field bg-surface"
          />
        </span>
        <Button
          type="submit"
          variant="ink"
          className="bg-danger hover:bg-danger min-h-10 hover:opacity-90"
          disabled={pending}
        >
          {pending ? "Offboarding…" : "Offboard brand"}
        </Button>
        <Button type="button" variant="quiet" className="min-h-10" onClick={onKeep}>
          Keep
        </Button>
      </div>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}

function RestoreButton({
  tenantId,
  name,
  onDone,
}: {
  tenantId: string;
  name: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<BrandActionState, FormData>(async (prev, fd) => {
    const out = await restoreAction(prev, fd);
    if (out.done) onDone();
    return out;
  }, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Button type="submit" size="sm" disabled={pending} aria-label={`Restore ${name}`}>
        {pending ? "Restoring…" : "Restore"}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}

function RetryButton({ tenantId, name }: { tenantId: string; name: string }) {
  const [state, action, pending] = useActionState<BrandActionState, FormData>(retryAction, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Button type="submit" size="sm" disabled={pending} aria-label={`Try again for ${name}`}>
        {pending ? "Trying…" : "Try again"}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
      {state.done && !state.issue && !pending && (
        <span role="status" className="meta inline-flex items-center gap-1">
          <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
          Done
        </span>
      )}
    </form>
  );
}
