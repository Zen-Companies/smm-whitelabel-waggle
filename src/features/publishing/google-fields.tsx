"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import { PlatformMark } from "@/components/app/platform-mark";
import { DateTimePicker, PickerShell } from "./date-time-picker";
import {
  BUTTON_WORDS,
  GOOGLE_BUTTONS,
  GOOGLE_COUPON_MAX,
  GOOGLE_TITLE_MAX,
  googleProblems,
  type GoogleButton,
  type GoogleKind,
  type GoogleOptions,
} from "./google-post";
import { clock12 } from "./post-time";

const KIND_WORDS: Record<GoogleKind, string> = { update: "Update", offer: "Offer", event: "Event" };

/** "Tue, Dec 1" or "Sat, Nov 28 · 10:00 AM". */
function dayLabel(day: string, time?: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return time ? `${label} · ${clock12(time)}` : label;
}

/**
 * Google Business under Options (Posts Round 4, approved 26 Nov): what kind of post (Update, Offer
 * or Event), the fields that kind needs, and a button. Offer: a title and the days it runs, then a
 * code, a redeem link and terms (all optional, as on Google). Event: a title, start and end (day
 * and time). Add a button: Book, Order, Shop, Learn more and Sign up ask for the link; Call now
 * calls the business phone from Business info, and is hidden with a hint when there's none.
 * On a phone the kinds are chips in a row and the buttons a 2-column grid; tapping the picked
 * button again removes it.
 */
export function GoogleFields({
  google,
  onChange,
  phone,
  today,
  timeZone,
  username,
}: {
  google: GoogleOptions | undefined;
  onChange: (next: GoogleOptions) => void;
  /** The business phone Waggle has (Business info), or null. */
  phone: string | null;
  today: string;
  timeZone: string;
  username: string | null;
}) {
  const g: GoogleOptions = google ?? { kind: "update" };
  const set = (patch: Partial<GoogleOptions>) => onChange({ ...g, ...patch });
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const problems = googleProblems(g, phone);
  const problem = (field: string) => problems.find((p) => p.field === field)?.message ?? null;
  const titled = g.kind === "offer" || g.kind === "event";
  const timed = g.kind === "event";
  const what = g.kind === "offer" ? "Offer" : "Event";

  return (
    <section className="flex flex-col gap-3" aria-labelledby="google-options">
      <h3 id="google-options" className="flex items-center gap-2 text-sm font-medium">
        <PlatformMark platform="googlebusiness" size={20} /> Google Business
        {username && <span className="text-ink-3 font-normal">@{username}</span>}
      </h3>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id="google-kind">
          What kind of post
        </span>
        <div
          className="segmented max-w-full self-start overflow-x-auto"
          role="radiogroup"
          aria-labelledby="google-kind"
        >
          {(["update", "offer", "event"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={g.kind === k}
              data-active={g.kind === k || undefined}
              onClick={() => set({ kind: k })}
            >
              {KIND_WORDS[k]}
            </button>
          ))}
        </div>
      </div>

      {titled && (
        <>
          <Field
            id="google-title"
            label={`${what} title`}
            error={problem("title")}
            hint={`${(g.title ?? "").length} / ${GOOGLE_TITLE_MAX}`}
          >
            <input
              id="google-title"
              value={g.title ?? ""}
              maxLength={GOOGLE_TITLE_MAX + 20}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={
                g.kind === "offer" ? "Christmas fruitcake, 20% off" : "Weekend sourdough class"
              }
              className="field"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["start", "end"] as const).map((edge) => {
              const day = edge === "start" ? g.startDay : g.endDay;
              const time = edge === "start" ? g.startTime : g.endTime;
              return (
                <Field
                  key={edge}
                  id={`google-${edge}`}
                  label={edge === "start" ? "Starts" : "Ends"}
                  error={problem(edge)}
                >
                  <div className="relative">
                    <button
                      id={`google-${edge}`}
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={picking === edge}
                      onClick={() => setPicking(picking === edge ? null : edge)}
                      className={cn(
                        "field inline-flex min-h-10 w-full items-center justify-between gap-2 tabular-nums",
                        !day && "text-ink-3",
                      )}
                    >
                      {day ? dayLabel(day, timed ? time : undefined) : "Pick a day"}
                      <ChevronDown className="text-ink-3 size-4" aria-hidden />
                    </button>
                    {picking === edge && (
                      <PickerShell
                        placement="popover"
                        onDismiss={() => setPicking(null)}
                        label={edge === "start" ? "When it starts" : "When it ends"}
                      >
                        <DateTimePicker
                          start={{
                            day: day ?? (edge === "end" ? (g.startDay ?? today) : today),
                            time: time ?? (edge === "start" ? "09:00" : "17:00"),
                          }}
                          today={today}
                          timeZone={timeZone}
                          chips={null}
                          dateOnly={!timed}
                          verb="Use"
                          title={edge === "start" ? "When it starts" : "When it ends"}
                          onCancel={() => setPicking(null)}
                          onPick={(d, t) => {
                            set(
                              edge === "start"
                                ? { startDay: d, startTime: timed ? t : undefined }
                                : { endDay: d, endTime: timed ? t : undefined },
                            );
                            setPicking(null);
                          }}
                        />
                      </PickerShell>
                    )}
                  </div>
                </Field>
              );
            })}
          </div>
          <p className="meta -mt-1">
            Google shows the {what.toLowerCase()} in Search and Maps until it ends, then removes the
            post.
          </p>
        </>
      )}

      {g.kind === "offer" && (
        <>
          <Field id="google-coupon" label="Coupon code" optional error={problem("coupon")}>
            <input
              id="google-coupon"
              value={g.coupon ?? ""}
              maxLength={GOOGLE_COUPON_MAX}
              onChange={(e) => set({ coupon: e.target.value })}
              placeholder="FRUIT20"
              className="field"
            />
          </Field>
          <Field id="google-redeem" label="Redeem link" optional error={problem("redeemUrl")}>
            <input
              id="google-redeem"
              type="url"
              inputMode="url"
              value={g.redeemUrl ?? ""}
              onChange={(e) => set({ redeemUrl: e.target.value })}
              placeholder="https://yourshop.com/order"
              className="field"
            />
          </Field>
          <Field id="google-terms" label="Terms" optional error={problem("terms")}>
            <textarea
              id="google-terms"
              rows={2}
              value={g.terms ?? ""}
              onChange={(e) => set({ terms: e.target.value })}
              placeholder="Pre-orders only. One code per order."
              className="field min-h-16 py-2.5"
            />
          </Field>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id="google-button">
          Add a button <span className="text-ink-3 font-normal">(optional)</span>
        </span>
        <div
          role="radiogroup"
          aria-labelledby="google-button"
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5"
        >
          <ButtonChip
            label="None"
            on={!g.button}
            onClick={() => set({ button: undefined })}
            className="max-sm:hidden"
          />
          {GOOGLE_BUTTONS.filter((b) => b !== "CALL" || phone).map((b) => (
            <ButtonChip
              key={b}
              label={BUTTON_WORDS[b].chip}
              on={g.button === b}
              // Tapping the picked one again takes the button off (phones have no None chip).
              onClick={() => set({ button: g.button === b ? undefined : (b as GoogleButton) })}
            />
          ))}
        </div>
        <span className="meta sm:hidden">Tap the picked one again for no button.</span>
        {!phone && (
          <span className="meta">
            Call now shows once Waggle has your phone number.{" "}
            <Link href="/teach/business-info" className="link-inline">
              Add it in Business info
            </Link>
          </span>
        )}
        {g.button === "CALL" && phone && (
          <p className="text-ink-2 text-sm">
            Calls your business phone, <b className="text-ink font-semibold">{phone}</b> (from Teach
            Waggle, Business info). No link needed.
          </p>
        )}
        {g.button && g.button !== "CALL" && (
          <Field
            id="google-button-url"
            label={`Link for ${BUTTON_WORDS[g.button].chip}`}
            error={problem("buttonUrl")}
            hint={`Google shows it as “${BUTTON_WORDS[g.button].google}”. The link must start with https://`}
          >
            <input
              id="google-button-url"
              type="url"
              inputMode="url"
              value={g.buttonUrl ?? ""}
              onChange={(e) => set({ buttonUrl: e.target.value })}
              placeholder="https://yourshop.com"
              className="field"
            />
          </Field>
        )}
        {problem("button") && <p className="text-danger text-sm">{problem("button")}</p>}
      </div>
      <p className="meta">
        Instagram and Facebook don&apos;t have offers or buttons: they get the same text and photo
        as a normal post. Google takes one photo and no video.
      </p>
    </section>
  );
}

function ButtonChip({
  label,
  on,
  onClick,
  className,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full border px-3.5 text-sm font-semibold sm:min-h-9",
        on
          ? "border-honey bg-honey-tint text-ink border-[1.5px]"
          : "border-line-strong bg-surface text-ink-2 hover:bg-subtle",
        className,
      )}
    >
      {label}
    </button>
  );
}

function Field({
  id,
  label,
  optional = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label} {optional && <span className="text-ink-3 font-normal">(optional)</span>}
      </label>
      {children}
      {error ? (
        <span className="text-honey-text text-sm">{error}</span>
      ) : hint ? (
        <span className="meta">{hint}</span>
      ) : null}
    </div>
  );
}
