"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  connectSiteAction,
  connectWhatsAppKeysAction,
  disconnectSiteAction,
  type OwnKeyState,
} from "./own-key-actions";
import type { OwnKeyPlatform } from "./own-keys";

type Field = { name: string; label: string; placeholder?: string; secret?: boolean };

const FORMS: Record<OwnKeyPlatform, { fields: Field[]; help: string; note?: string }> = {
  shopify: {
    fields: [
      { name: "shop", label: "Store address", placeholder: "harbour-bean.myshopify.com" },
      { name: "accessToken", label: "Admin API key", placeholder: "shpat_…", secret: true },
    ],
    help: "In Shopify: Settings → Apps and sales channels → Develop apps → Create an app. Allow content, products and inventory (read and write), plus locations and orders (read), install it, then copy the Admin API access token.",
    note: "Tracking pixels for your ads need an app install instead; that comes later.",
  },
  wordpress: {
    fields: [
      { name: "siteUrl", label: "Site address", placeholder: "https://harbourbean.ph" },
      { name: "username", label: "Username" },
      { name: "applicationPassword", label: "App password", secret: true },
    ],
    help: "In WordPress: Users → Profile → Application Passwords. Name it “Waggle”, then copy the password it shows once.",
    note: "If the site runs WooCommerce, its products and orders come with it.",
  },
  webflow: {
    fields: [{ name: "siteToken", label: "Site key", secret: true }],
    help: "In Webflow: Site settings → Apps & integrations → API access → Generate API token. Sites: read. CMS: read and write.",
  },
};

function Fields({ fields, state }: { fields: Field[]; state: OwnKeyState }) {
  return fields.map((f) => (
    <label key={f.name} className="flex flex-col gap-1.5 text-sm font-medium">
      {f.label}
      <input
        name={f.name}
        type={f.secret ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        placeholder={f.placeholder}
        className="field"
        aria-invalid={state.field === f.name || undefined}
        required
      />
      {state.field === f.name && state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </label>
  ));
}

/** Connect Shopify / WordPress / Webflow with the owner's own keys (design "Connect with your own keys"). */
export function SiteKeysForm({ kind }: { kind: OwnKeyPlatform }) {
  const [state, action, pending] = useActionState<OwnKeyState, FormData>(connectSiteAction, {});
  const form = FORMS[kind];
  if (state.done) {
    return (
      <p role="status" className="text-success text-sm font-medium">
        {state.done}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 pt-3">
      <input type="hidden" name="kind" value={kind} />
      <Fields fields={form.fields} state={state} />
      <p className="meta">{form.help}</p>
      {form.note && <p className="meta">{form.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Checking…" : "Connect"}
        </Button>
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

/** WhatsApp with the business's own Meta keys (Advanced). */
export function WhatsAppKeysForm() {
  const [state, action, pending] = useActionState<OwnKeyState, FormData>(
    connectWhatsAppKeysAction,
    {},
  );
  if (state.done) {
    return (
      <p role="status" className="text-success text-sm font-medium">
        {state.done}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 pt-3">
      <Fields
        state={state}
        fields={[
          { name: "accessToken", label: "Access token", secret: true },
          { name: "wabaId", label: "WhatsApp Business Account ID" },
          { name: "phoneNumberId", label: "Phone number ID" },
        ]}
      />
      <p className="meta">
        A permanent System User token from Meta Business Settings, with WhatsApp management and
        messaging allowed.
      </p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Two-step PIN <span className="text-ink-3 font-normal">(only if the number has one)</span>
        <input name="pin" inputMode="numeric" autoComplete="off" className="field w-40" />
        {state.field === "pin" && state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </label>
      <p className="meta">
        Connecting moves this number&apos;s messages to Waggle: any other app reading them stops
        getting them.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Checking…" : "Connect"}
        </Button>
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

/** Disconnect a site, confirmed in place. */
export function DisconnectSite({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<OwnKeyState, FormData>(disconnectSiteAction, {});
  const [sure, setSure] = useState(false);
  if (state.done) return <span className="text-ink-3 text-sm">{state.done}</span>;
  return sure ? (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <span>Disconnect {label}?</span>
      <Button type="submit" variant="secondary" disabled={pending}>
        Disconnect
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
      Disconnect
    </Button>
  );
}
