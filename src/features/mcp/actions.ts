"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { mcpEnabled } from "./auth";
import { deleteGrant, saveGrant } from "./grants";
import { assistantName, redirectAllowed, redirectAllowlist } from "./redirects";

// Connecting, changing and disconnecting AI assistants (docs/mcp/PLAN.md §4.2, design v3 "AI
// assistants"). Everything about the request is re-read from Supabase here: the form only says
// which authorization and which brands.

export interface ConsentState {
  error?: string;
}

const consentSchema = z.object({
  authorizationId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  brands: z.array(z.uuid()),
});

export async function approveConnection(
  _prev: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  if (!mcpEnabled()) return { error: "Connecting AI assistants is paused right now." };
  const parsed = consentSchema.safeParse({
    authorizationId: formData.get("authorizationId"),
    brands: formData.getAll("brands"),
  });
  if (!parsed.success)
    return { error: "Something went wrong. Start again from your AI assistant." };
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(
    parsed.data.authorizationId,
  );
  if (error || !details) {
    return { error: "This request has expired. Start again from your AI assistant." };
  }
  if (!("authorization_id" in details)) redirect(details.redirect_url);
  if (details.user.id !== user.id) return { error: "This request is for another login." };
  if (!redirectAllowed(details.redirect_uri, redirectAllowlist())) {
    return { error: "This app can't connect to Waggle." };
  }

  const saved = await saveGrant(getServiceClient(), {
    userId: user.id,
    clientId: details.client.id,
    clientName: assistantName(details.client.name, details.redirect_uri),
    brandIds: parsed.data.brands,
  });
  if (!saved.ok) {
    return {
      error:
        saved.error === "no_brands"
          ? "Pick at least one brand."
          : "Pick your own brands only. Reload the page and try again.",
    };
  }
  const { data: done, error: approveError } = await supabase.auth.oauth.approveAuthorization(
    details.authorization_id,
    { skipBrowserRedirect: true },
  );
  if (approveError || !done) {
    Sentry.captureException(approveError ?? new Error("approveAuthorization returned nothing"), {
      extra: { userId: user.id },
    });
    return { error: "Couldn't finish connecting. Start again from your AI assistant." };
  }
  redirect(done.redirect_url);
}

export async function denyConnection(formData: FormData): Promise<void> {
  const id = z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,100}$/)
    .safeParse(formData.get("authorizationId"));
  if (!id.success) redirect("/settings?section=ai-assistants");
  await getCurrentUser();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.oauth.denyAuthorization(id.data, {
    skipBrowserRedirect: true,
  });
  // Only back to an assistant we support; otherwise just leave the page.
  const back = data?.redirect_url;
  redirect(
    back && redirectAllowed(back, redirectAllowlist()) ? back : "/settings?section=ai-assistants",
  );
}

export interface GrantFormState {
  error?: string;
  saved?: boolean;
}

const grantSchema = z.object({
  clientId: z.string().min(1).max(200),
  clientName: z.string().max(200),
  brands: z.array(z.uuid()),
});

/** Settings → AI assistants → Change brands. */
export async function updateGrantBrands(
  _prev: GrantFormState,
  formData: FormData,
): Promise<GrantFormState> {
  const parsed = grantSchema.safeParse({
    clientId: formData.get("clientId"),
    clientName: formData.get("clientName") ?? "",
    brands: formData.getAll("brands"),
  });
  if (!parsed.success) return { error: "Something went wrong. Reload the page." };
  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data: existing } = await db
    .from("mcp_grants")
    .select("client_name")
    .eq("user_id", user.id)
    .eq("client_id", parsed.data.clientId)
    .maybeSingle();
  if (!existing) return { error: "This assistant isn't connected any more." };
  const saved = await saveGrant(db, {
    userId: user.id,
    clientId: parsed.data.clientId,
    clientName: existing.client_name,
    brandIds: parsed.data.brands,
  });
  if (!saved.ok) {
    return {
      error:
        saved.error === "no_brands"
          ? "Pick at least one brand, or disconnect it instead."
          : "Pick your own brands only.",
    };
  }
  revalidatePath("/settings");
  return { saved: true };
}

/** Settings → AI assistants → Disconnect: Supabase revokes its tokens; our grant row goes too. */
export async function disconnectAssistant(formData: FormData): Promise<void> {
  const clientId = z.string().min(1).max(200).safeParse(formData.get("clientId"));
  if (!clientId.success) return;
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: clientId.data });
  // Our row goes regardless: without it no token is accepted by /api/mcp.
  if (error && error.status !== 404) {
    Sentry.captureException(error, { extra: { userId: user.id } });
  }
  await deleteGrant(getServiceClient(), { userId: user.id, clientId: clientId.data });
  revalidatePath("/settings");
}
