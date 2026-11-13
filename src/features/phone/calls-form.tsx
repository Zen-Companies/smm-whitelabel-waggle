"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { VoiceSettings } from "@/lib/social/types";
import { saveVoiceAction, type VoiceState } from "./actions";
import { DAYS } from "./voice";

/** Calls (design "Settings · Phone"): ring this phone, voicemail greeting, open hours. */
export function CallsForm({
  numberId,
  settings,
  greeting,
}: {
  numberId: string;
  settings: VoiceSettings;
  greeting: string;
}) {
  const [state, action, pending] = useActionState<VoiceState, FormData>(saveVoiceAction, {});
  const [hoursOn, setHoursOn] = useState(settings.businessHoursEnabled);
  const byDay = new Map(settings.businessHours.map((h) => [h.day, h]));
  const zone =
    settings.businessHoursTimezone ||
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  const err = (f: string) =>
    state.field === f && state.error ? (
      <span role="alert" className="text-danger text-sm">
        {state.error}
      </span>
    ) : null;
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <h3 className="font-semibold">Calls</h3>
      <input type="hidden" name="numberId" value={numberId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Ring this phone
        <input
          name="forwardTo"
          inputMode="tel"
          defaultValue={settings.forwardTo?.replace(/^tel:/, "") ?? ""}
          placeholder="+1 415 555 0199"
          className="field w-64"
        />
        <span className="meta">Leave it empty to send every call to voicemail.</span>
        {err("forwardTo")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Voicemail greeting
        <textarea
          name="voicemailGreeting"
          rows={3}
          defaultValue={settings.voicemailGreeting ?? greeting}
          className="field min-h-20 py-2"
        />
        <span className="meta">
          Read out to callers. Voicemail picks up after about 25 seconds of ringing.
        </span>
        {err("voicemailGreeting")}
      </label>
      <fieldset className="flex flex-col gap-2">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            name="hoursOn"
            value="yes"
            checked={hoursOn}
            onChange={(e) => setHoursOn(e.target.checked)}
            className="size-4"
          />
          Open hours
        </label>
        {hoursOn && (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              Time zone
              <input name="timezone" defaultValue={zone} className="field w-64" />
              {err("timezone")}
            </label>
            <ul className="flex flex-col gap-1.5">
              {DAYS.map((label, day) => {
                const h = byDay.get(day);
                const open = settings.businessHours.length ? !!h : day >= 1 && day <= 5;
                return (
                  <li key={label} className="flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex w-20 items-center gap-2">
                      <input
                        type="checkbox"
                        name={`open_${day}`}
                        value="yes"
                        defaultChecked={open}
                        className="size-4"
                      />
                      {label}
                    </label>
                    <input
                      type="time"
                      name={`from_${day}`}
                      defaultValue={h?.open ?? "09:00"}
                      className="field w-32"
                      aria-label={`${label} opens`}
                    />
                    <span>to</span>
                    <input
                      type="time"
                      name={`to_${day}`}
                      defaultValue={h?.close ?? "17:00"}
                      className="field w-32"
                      aria-label={`${label} closes`}
                    />
                  </li>
                );
              })}
            </ul>
            {err("hours")}
            <p className="meta">Outside open hours, callers go straight to voicemail.</p>
          </>
        )}
      </fieldset>
      <p className="meta">Voicemails and missed calls show in the inbox.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.savedAt && !state.error && (
          <span role="status" className="text-success text-sm">
            Saved.
          </span>
        )}
        {state.error && !state.field && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
