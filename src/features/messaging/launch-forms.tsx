"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RcsAgentView } from "@/lib/social/types";
import {
  addTestPhoneAction,
  removeTestPhoneAction,
  sendLaunchAction,
  type RcsState,
} from "./actions";
import { INTERACTIONS, OPT_IN_METHODS } from "./launch";

const INVITE: Record<RcsAgentView["testDevices"][number]["inviteStatus"], string> = {
  PENDING: "Waiting: accept the invite in the phone's messaging app",
  ACCEPTED: "Ready",
  DECLINED: "Declined",
};

function RemovePhone({ agentId, deviceId }: { agentId: string; deviceId: string }) {
  const [state, action, pending] = useActionState<RcsState, FormData>(removeTestPhoneAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="deviceId" value={deviceId} />
      <Button type="submit" variant="quiet" disabled={pending}>
        Remove
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** US testing (T83b): phones that may receive the agent's messages before launch. */
export function TestPhones({
  agentId,
  devices,
}: {
  agentId: string;
  devices: RcsAgentView["testDevices"];
}) {
  const [state, action, pending] = useActionState<RcsState, FormData>(addTestPhoneAction, {});
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">1. Try it on your phone</h4>
      <p className="meta">
        Only phones you invite get messages while testing. T-Mobile and AT&amp;T numbers can&apos;t
        be test phones.
      </p>
      {devices.length > 0 && (
        <ul className="divide-line flex flex-col divide-y">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="font-medium tabular-nums">{d.phoneNumber}</span>
              <span className="meta flex-1">{INVITE[d.inviteStatus]}</span>
              <RemovePhone agentId={agentId} deviceId={d.id} />
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="agentId" value={agentId} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Phone
          <input
            name="phoneNumber"
            type="tel"
            placeholder="+1 415 555 0188"
            className="field w-56"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Inviting…" : "Invite phone"}
        </Button>
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
        {state.done && (
          <span role="status" className="text-success text-sm">
            {state.done}
          </span>
        )}
      </form>
    </div>
  );
}

/** The launch details (T83b): what you'll send and how people agree to it. */
export function LaunchForm({
  agentId,
  us,
  defaults,
}: {
  agentId: string;
  us: boolean;
  defaults: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<RcsState, FormData>(sendLaunchAction, {});
  const values = { ...defaults, ...state.values };
  const picked = (k: string) => (values[k] ?? "").split(",").filter(Boolean);
  const [methods, setMethods] = useState<string[]>(picked("optIn"));
  const [double, setDouble] = useState(values.doubleOptIn === "yes");
  if (state.done) {
    return (
      <p role="status" className="text-success text-sm font-medium">
        {state.done}
      </p>
    );
  }
  const err = (f: string) =>
    state.field === f && state.error ? (
      <span role="alert" className="text-danger text-sm">
        {state.error}
      </span>
    ) : null;
  const text = (name: string, label: string, hint?: string, rows = 2) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <textarea
        name={name}
        rows={rows}
        defaultValue={values[name] ?? ""}
        className="field min-h-16 py-2"
      />
      {hint && <span className="meta">{hint}</span>}
      {err(name)}
    </label>
  );
  const input = (name: string, label: string, placeholder?: string, hint?: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input
        name={name}
        placeholder={placeholder}
        defaultValue={values[name] ?? ""}
        className="field"
      />
      {hint && <span className="meta">{hint}</span>}
      {err(name)}
    </label>
  );
  const checks = (
    name: string,
    legend: string,
    options: Record<string, string>,
    onToggle?: (k: string, on: boolean) => void,
  ) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {Object.entries(options).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={k}
              defaultChecked={picked(name).includes(k)}
              onChange={onToggle ? (e) => onToggle(k, e.target.checked) : undefined}
              className="size-4"
            />
            {v}
          </label>
        ))}
      </div>
      {err(name)}
    </fieldset>
  );
  const web = methods.includes("WEBSITE");
  const shot = web || methods.includes("MOBILE_APP");
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="agentId" value={agentId} />
      <h4 className="text-sm font-semibold">{us ? "2. " : ""}Send the launch details</h4>
      <p className="meta">Carriers read these before you can text everyone.</p>
      {text("companyOverview", "What the business does")}
      {text("agentOverview", "What you'll send, and to whom")}
      {checks("interactions", "Kinds of messages", INTERACTIONS)}
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i}>{text(`example${i}`, `Example message ${i}`)}</div>
        ))}
      </div>
      {checks("optIn", "How people agree to your messages", OPT_IN_METHODS, (k, on) =>
        setMethods((m) => (on ? [...m, k] : m.filter((x) => x !== k))),
      )}
      {text(
        "callToAction",
        "The words they agree to",
        "Like “Tick to get order updates by message. Reply STOP to opt out.”",
      )}
      {web && input("callToActionUrl", "Page with the box", "https://")}
      {shot && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Screenshot of where they agree
          <input
            name="screenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="field py-2"
          />
          {err("screenshot")}
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="doubleOptIn"
          value="yes"
          checked={double}
          onChange={(e) => setDouble(e.target.checked)}
          className="size-4"
        />
        Ask them to confirm with a reply first
      </label>
      {double && text("doubleOptInMessage", "The confirm message")}
      <div className="grid gap-3 sm:grid-cols-3">
        {text("optInMessage", "Welcome message")}
        {text("helpResponse", "Reply to HELP")}
        {text("optOutResponse", "Reply to STOP")}
      </div>
      {input(
        "testVideoUrl",
        us ? "Test video link" : "Test video link (optional)",
        "https://",
        "A video of a test phone sending START, STOP and HELP, plus one real conversation. An unlisted YouTube link works.",
      )}
      {text("additionalInformation", "Anything else carriers should know (optional)")}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send launch details"}
        </Button>
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.field ? `Check the form: ${state.error}` : state.error}
          </span>
        )}
      </div>
    </form>
  );
}
