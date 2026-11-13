"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { fixRcsAction, requestRcsAction, type RcsState } from "./actions";
import {
  contrastOnWhite,
  LEGAL_ENTITY_TYPES,
  ORGANIZATION_TYPES,
  RCS_COUNTRIES,
  RCS_USE_CASES,
} from "./rcs";

/** Prefill values, by form field name. */
export type RcsDefaults = Record<string, string>;

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * The branded-texts request (design "Settings · Messaging"). `agentId` set = fixing a request
 * after changes were asked for: the logo and banner may be kept.
 */
export function RcsRequestForm({
  requestKey,
  agentId,
  defaults,
}: {
  requestKey?: string;
  agentId?: string;
  defaults: RcsDefaults;
}) {
  const [state, action, pending] = useActionState<RcsState, FormData>(
    agentId ? fixRcsAction : requestRcsAction,
    {},
  );
  const values = { ...defaults, ...state.values };
  const [country, setCountry] = useState(values.country || "US");
  const [org, setOrg] = useState(values.organizationType || "PRIVATE_PROFIT");
  const [color, setColor] = useState(values.brandColor || "#1A73E8");
  const us = country === "US";
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
  const input = (
    name: string,
    label: string,
    o: { placeholder?: string; type?: string; hint?: string; maxLength?: number } = {},
  ) => (
    <label key={name} className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input
        name={name}
        type={o.type ?? "text"}
        placeholder={o.placeholder}
        maxLength={o.maxLength}
        defaultValue={values[name] ?? ""}
        className="field"
      />
      {o.hint && <span className="meta">{o.hint}</span>}
      {err(name)}
    </label>
  );
  const select = (
    name: string,
    label: string,
    options: Record<string, string>,
    onChange?: (v: string) => void,
  ) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <select
        name={name}
        defaultValue={values[name] || Object.keys(options)[0]}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="field"
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {err(name)}
    </label>
  );
  const image = (name: "logo" | "banner", label: string, hint: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input name={name} type="file" accept={IMAGE_ACCEPT} className="field py-2" />
      <span className="meta">
        {hint}
        {agentId ? " Leave empty to keep the one you sent." : ""}
      </span>
      {err(name)}
    </label>
  );
  const readable = contrastOnWhite(color) >= 4.5;
  return (
    <form action={action} className="flex flex-col gap-5">
      {requestKey && <input type="hidden" name="requestKey" value={requestKey} />}
      {agentId && <input type="hidden" name="agentId" value={agentId} />}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">What customers see</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("displayName", "Name shown to customers", {
            hint: "Up to 40 characters.",
            maxLength: 40,
          })}
          {select("useCase", "What you'll send", RCS_USE_CASES)}
          <div className="sm:col-span-2">
            {input("description", "Short description", {
              hint: "Up to 100 characters.",
              maxLength: 100,
            })}
          </div>
          {image("logo", "Logo", "Square works best. We crop it to the carriers' size.")}
          {image("banner", "Banner", "A wide image across the top of your profile.")}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Brand color
            <span className="flex items-center gap-2">
              <input
                type="color"
                value={color.toLowerCase()}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="h-10 w-12 cursor-pointer rounded-md border-0 bg-transparent p-0"
                aria-label="Pick a brand color"
              />
              <input
                name="brandColor"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="field w-32 font-mono"
              />
            </span>
            {!readable && /^#[0-9A-Fa-f]{6}$/.test(color) && (
              <span className="text-honey-text text-sm">Too light to read on white.</span>
            )}
            {err("brandColor")}
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("privacyPolicyUrl", "Privacy policy link", { placeholder: "https://" })}
          {input("termsUrl", "Terms link", { placeholder: "https://" })}
        </div>
        <p className="text-sm font-medium">Buttons on your profile</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("buttonPhone", "Call us", { type: "tel", placeholder: "+1 415 555 0199" })}
          {input("buttonEmail", "Email us", { type: "email", placeholder: "hello@" })}
        </div>
        <p className="meta">A phone or an email is needed. Your website gets a button too.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Your company</legend>
        <p className="meta">
          Carriers check these against official records, so match them exactly.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("legalName", "Legal company name")}
          {select("legalEntityType", "Kind of company", LEGAL_ENTITY_TYPES)}
          {select("organizationType", "Organization", ORGANIZATION_TYPES, setOrg)}
          {org === "PUBLIC_PROFIT" &&
            input("stockSymbol", "Stock symbol", { placeholder: "NASDAQ:ACME" })}
          {select("country", "Country", RCS_COUNTRIES, setCountry)}
          {input("taxId", us ? "EIN" : "Tax or company number", {
            placeholder: us ? "12-3456789" : undefined,
          })}
          {input("websiteUrl", "Website", { placeholder: "https://" })}
          {input("line1", "Street address")}
          {input("line2", "Apartment, suite (optional)")}
          {input("city", "City")}
          {us && input("state", "State", { placeholder: "CA", maxLength: 2 })}
          {input("postalCode", us ? "ZIP" : "Postal code")}
        </div>
        {country === "ES" && (
          <p className="meta">
            Carriers have paused new senders in Spain; yours is filed when they reopen.
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">A person carriers can contact</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-3">
              {input("firstName", "First name")}
              {input("lastName", "Last name")}
            </div>
            {err("contactName")}
          </div>
          {input("contactTitle", "Job title (optional)")}
          {input("contactEmail", "Work email", {
            type: "email",
            hint: "Their own address on the company's domain. Gmail and info@ are refused.",
          })}
          {input("contactPhone", "Phone", { type: "tel", placeholder: "+1 415 555 0142" })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : agentId ? "Send again" : "Request branded texts"}
        </Button>
        {state.error && !state.field && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
        {state.error && state.field && (
          <span role="alert" className="text-danger text-sm">
            Check the form: {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
