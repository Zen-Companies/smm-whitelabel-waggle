import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { requireBeta } from "@/features/beta";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { denyConnection } from "./actions";
import { mcpBrandsOn, mcpOnGlobally } from "./flags";
import { ConsentForm } from "./consent-form";
import { loadUserBrands } from "./grants";
import { assistantName, redirectAllowed, redirectAllowlist } from "./redirects";

// /oauth/consent (design v3 "AI assistants · Connect" + its states). Supabase sends the user here
// with an authorization_id after an AI assistant starts signing in.

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="page-title">{title}</h1>
      <div className="text-ink-2 flex flex-col gap-4 text-[15px]">{children}</div>
    </div>
  );
}

function Tiles({ letter }: { letter: string }) {
  return (
    <div className="flex items-center gap-3.5" aria-hidden>
      <span className="border-line bg-subtle text-ink flex size-12 items-center justify-center rounded-xl border text-lg font-bold">
        {letter}
      </span>
      <ArrowRight className="text-ink-3 size-5" />
      <span className="bg-honey-tint text-honey-text flex size-12 items-center justify-center rounded-xl text-xl font-bold">
        w
      </span>
    </div>
  );
}

export async function ConsentScreen({ authorizationId }: { authorizationId: string | null }) {
  if (!(await mcpOnGlobally(getServiceClient()))) {
    return (
      <Message title="AI assistants are paused">
        <p>
          Connecting AI assistants is switched off for now. Your Waggle inbox keeps working as
          usual.
        </p>
      </Message>
    );
  }
  if (!authorizationId || !/^[A-Za-z0-9_-]{1,100}$/.test(authorizationId)) {
    return (
      <Message title="This link doesn't work">
        <p>Start connecting again from your AI assistant.</p>
      </Message>
    );
  }

  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    const next = `/oauth/consent?authorization_id=${authorizationId}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  // The beta gate applies here too: no beta access, no brands to share.
  await requireBeta();
  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return (
      <Message title="This request has expired">
        <p>Start connecting again from your AI assistant. Nothing was shared.</p>
      </Message>
    );
  }
  // Already allowed before: Supabase hands back the redirect straight away.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  if (!redirectAllowed(details.redirect_uri, redirectAllowlist())) {
    let host = "an unknown address";
    try {
      host = new URL(details.redirect_uri).hostname;
    } catch {}
    return (
      <Message title="This app can't connect to Waggle">
        <p>
          It asked to send you back to <b className="text-ink font-semibold">{host}</b>, which
          isn&apos;t Claude, ChatGPT or Grok. Nothing was shared.
        </p>
        <form action={denyConnection}>
          <input type="hidden" name="authorizationId" value={details.authorization_id} />
          <Button type="submit">Close</Button>
        </form>
      </Message>
    );
  }

  const assistant = assistantName(details.client.name, details.redirect_uri);
  const db = getServiceClient();
  const [brands, { data: grant }] = await Promise.all([
    loadUserBrands(db, auth.user.id),
    db
      .from("mcp_grants")
      .select("tenant_ids")
      .eq("user_id", auth.user.id)
      .eq("client_id", details.client.id)
      .maybeSingle(),
  ]);
  const { data: accounts } = await db
    .from("social_accounts")
    .select("tenant_id, platform, username")
    .eq("status", "active")
    .in(
      "tenant_id",
      brands.map((b) => b.id),
    );
  const on = await mcpBrandsOn(
    db,
    brands.map((b) => b.id),
  );
  if (!on.size) {
    return (
      <Message title="AI assistants aren't available for your brands yet">
        <p>We&apos;re turning this on brand by brand. Nothing was shared with {assistant}.</p>
        <form action={denyConnection}>
          <input type="hidden" name="authorizationId" value={details.authorization_id} />
          <Button type="submit">Back to {assistant}</Button>
        </form>
      </Message>
    );
  }
  const usable = brands.filter((b) => on.has(b.id));
  const ticked = new Set(
    (grant?.tenant_ids ?? (usable.length === 1 ? [usable[0].id] : [])).filter((id) => on.has(id)),
  );
  const accountsOf = (tenantId: string) => {
    const list = (accounts ?? [])
      .filter((a) => a.tenant_id === tenantId)
      .map(
        (a) =>
          `${a.platform === "facebook" ? "Facebook" : "Instagram"}${a.username ? ` @${a.username}` : ""}`,
      );
    return list.length ? list.join(" · ") : "No accounts connected yet";
  };

  return (
    <div className="flex flex-col gap-6">
      <Tiles letter={assistant.slice(0, 1).toUpperCase()} />
      <div className="flex flex-col gap-2">
        <h1 className="page-title">{assistant} wants to use Waggle</h1>
        <p className="text-ink-2 text-[15px]">
          {assistant} will work as you ({details.user.email}), on the brands you pick below.
        </p>
      </div>
      <ConsentForm
        authorizationId={details.authorization_id}
        assistant={assistant}
        brands={brands.map((b) => ({
          id: b.id,
          name: b.name,
          accounts: on.has(b.id)
            ? accountsOf(b.id)
            : "AI assistants aren't turned on for this brand yet.",
          checked: ticked.has(b.id),
          disabled: !on.has(b.id),
        }))}
      />
    </div>
  );
}
