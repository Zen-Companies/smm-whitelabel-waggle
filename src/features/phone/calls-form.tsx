"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { VoiceSettings } from "@/lib/social/types";
import { saveVoiceAction, type VoiceState } from "./actions";
import { AI_SERVICES, answererOf, DAYS, type AiService, type Answerer } from "./voice";

/** Calls (design "Settings · Phone"): who answers, the voicemail greeting, open hours. */
export function CallsForm({
  numberId,
  phoneNumber,
  settings,
  greeting,
}: {
  numberId: string;
  /** E.164, for Retell and ElevenLabs (they're set up with the number itself). */
  phoneNumber: string;
  settings: VoiceSettings;
  greeting: string;
}) {
  const [state, action, pending] = useActionState<VoiceState, FormData>(saveVoiceAction, {});
  const [hoursOn, setHoursOn] = useState(settings.businessHoursEnabled);
  const now = answererOf(settings.forwardTo);
  const [mode, setMode] = useState<Answerer["mode"]>(now.mode);
  const [service, setService] = useState<AiService>(now.mode === "ai" ? now.service : "vapi");
  const phoneLabel = phoneNumber;
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
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Who answers calls</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ring", "Ring my phone"],
              ["voicemail", "Voicemail"],
              ["ai", "AI receptionist"],
            ] as const
          ).map(([m, label]) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-sm ${mode === m ? "border-ink bg-ink text-surface" : "border-line-strong"}`}
            >
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {mode === "ring" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Ring this phone
            <input
              name="forwardTo"
              inputMode="tel"
              defaultValue={now.mode === "ring" ? now.phone : ""}
              placeholder="+1 415 555 0199"
              className="field w-64"
            />
            {err("forwardTo")}
          </label>
        )}
        {mode === "voicemail" && <p className="meta">Every call goes straight to voicemail.</p>}
        {mode === "ai" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              AI service
              <select
                name="aiService"
                value={service}
                onChange={(e) => setService(e.target.value as AiService)}
                className="field w-72"
              >
                {(Object.keys(AI_SERVICES) as AiService[]).map((s) => (
                  <option key={s} value={s}>
                    {AI_SERVICES[s]}
                  </option>
                ))}
              </select>
              {err("aiService")}
            </label>
            {service === "vapi" && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                SIP username from Vapi
                <input
                  name="vapiUsername"
                  defaultValue={now.mode === "ai" ? (now.vapiUsername ?? "") : ""}
                  placeholder="harbour-bean"
                  className="field w-72"
                />
                <span className="meta">
                  In Vapi, give your assistant a SIP username, then paste it here.
                </span>
                {err("vapiUsername")}
              </label>
            )}
            {(service === "retell" || service === "elevenlabs") && (
              <p className="meta">
                In {AI_SERVICES[service]}, add {phoneLabel} as a phone number &ldquo;through SIP
                trunking&rdquo;, exactly as written with the +, and give it your agent. Nothing else
                to paste.
              </p>
            )}
            {service === "other" && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Address from your AI service
                <input
                  name="aiAddress"
                  defaultValue={now.mode === "ai" ? (now.address ?? "") : ""}
                  placeholder="sip:… or wss://…"
                  className="field"
                />
                {err("aiAddress")}
              </label>
            )}
            <p className="meta">
              To pass callers to you when they ask for a person, add a transfer to your phone in
              your AI service. If the AI service doesn&apos;t answer, the call goes to voicemail.
              Calls are charged per minute, incoming only.
            </p>
          </div>
        )}
      </fieldset>
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
