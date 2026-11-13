"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError, type RcsAgentView } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { messagingOn } from "./flags";
import { canFix, checkImage, isClosed, parseRcsRequest } from "./rcs";

export type RcsState = {
  error?: string;
  field?: string;
  done?: string;
  /** What was typed, so a refused form refills (files can't be). */
  values?: Record<string, string>;
};

const typed = (f: FormData): Record<string, string> =>
  Object.fromEntries(
    [...f.entries()].flatMap(([k, v]) =>
      typeof v === "string" && k !== "requestKey" && k !== "agentId" ? [[k, v.slice(0, 500)]] : [],
    ),
  );

const SETTINGS = "/settings";
const IMAGE_ERROR = "Use a PNG, JPEG or WebP image under 2.5 MB.";

/** Owner/admin, with Messaging switched on for the brand by staff. */
async function messagingTenant() {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return null;
  return (await messagingOn(getServiceClient(), tenant.id)) ? tenant : null;
}

function providerError(error: unknown, tenantId: string, step: string): RcsState {
  const s = error instanceof SocialProviderError ? error.details.status : undefined;
  if (s === 400) return { error: "A detail wasn't accepted. Check the form and try again." };
  if (s === 402 || s === 403 || s === 422) {
    return { error: "Branded texts can't be requested for this brand yet. Contact support." };
  }
  if (s === 409) return { error: "This request can't be changed any more. Reload the page." };
  Sentry.captureException(error, { extra: { tenantId, step } });
  return { error: "It couldn't be sent right now. Reload before trying again." };
}

/** Uploads a new logo and banner when given; the fix form may keep the filed ones. */
async function images(f: FormData, filed: Record<string, unknown> | null) {
  const logo = checkImage(f.get("logo"));
  const banner = checkImage(f.get("banner"));
  if (logo === "bad") return { error: IMAGE_ERROR, field: "logo" } as const;
  if (banner === "bad") return { error: IMAGE_ERROR, field: "banner" } as const;
  const keptLogo = typeof filed?.logoUrl === "string" ? filed.logoUrl : null;
  const keptHero = typeof filed?.heroUrl === "string" ? filed.heroUrl : null;
  if (!logo && !keptLogo) return { error: "Add your logo.", field: "logo" } as const;
  if (!banner && !keptHero) return { error: "Add a banner image.", field: "banner" } as const;
  const social = getSocialProvider();
  const [logoUrl, heroUrl] = await Promise.all([
    logo
      ? social.uploadRcsAsset({ file: logo, kind: "logo", signal: AbortSignal.timeout(30_000) })
      : { url: keptLogo as string },
    banner
      ? social.uploadRcsAsset({ file: banner, kind: "banner", signal: AbortSignal.timeout(30_000) })
      : { url: keptHero as string },
  ]);
  return { logoUrl: logoUrl.url, heroUrl: heroUrl.url } as const;
}

async function brandAgents(profileId: string): Promise<RcsAgentView[]> {
  return getSocialProvider().listRcsAgents({ profileId, signal: AbortSignal.timeout(15_000) });
}

/** Request branded texts (T83a): nothing is filed or billed until the partner's review. */
export async function requestRcsAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const key = z.uuid().safeParse(f.get("requestKey"));
  if (!key.success) return { error: "Something went wrong. Reload the page." };
  const parsed = parseRcsRequest(f);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field, values: typed(f) };
  try {
    if ((await brandAgents(tenant.zernioProfileId)).some((a) => !isClosed(a))) {
      return { error: "This brand already has a request. Reload the page." };
    }
    const pics = await images(f, null);
    if ("error" in pics) return { ...pics, values: typed(f) };
    const agent = await getSocialProvider().requestRcsAgent({
      body: {
        profileId: tenant.zernioProfileId,
        brand: parsed.value.brand,
        displayName: parsed.value.displayName,
        useCase: parsed.value.useCase,
        profile: { ...parsed.value.profile, ...pics },
      },
      idempotencyKey: key.data,
      signal: AbortSignal.timeout(45_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "rcs_requested",
      actor: tenant.userId,
      // Ids only: no company details in the audit.
      details: { agentId: agent.id, country: String(f.get("country")) },
    });
  } catch (error) {
    return { ...providerError(error, tenant.id, "requestRcs"), values: typed(f) };
  }
  revalidatePath(SETTINGS);
  return { done: "Request sent. We'll show each step here." };
}

/** Fix the request after changes were asked for; it goes back to review. */
export async function fixRcsAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const parsed = parseRcsRequest(f);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field, values: typed(f) };
  const agentId = String(f.get("agentId") ?? "");
  try {
    const agent = (await brandAgents(tenant.zernioProfileId)).find((a) => a.id === agentId);
    if (!agent || !canFix(agent)) {
      return { error: "This request can't be changed any more. Reload the page." };
    }
    const pics = await images(f, agent.filed.profile);
    if ("error" in pics) return { ...pics, values: typed(f) };
    await getSocialProvider().updateRcsAgent({
      agentId,
      body: {
        brand: parsed.value.brand,
        displayName: parsed.value.displayName,
        useCase: parsed.value.useCase,
        profile: { ...parsed.value.profile, ...pics },
      },
      signal: AbortSignal.timeout(45_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "rcs_request_fixed",
      actor: tenant.userId,
      details: { agentId },
    });
  } catch (error) {
    return { ...providerError(error, tenant.id, "fixRcs"), values: typed(f) };
  }
  revalidatePath(SETTINGS);
  return { done: "Sent back for review." };
}
