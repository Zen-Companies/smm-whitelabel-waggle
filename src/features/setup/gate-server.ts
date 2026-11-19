import "server-only";
import { staffAccess } from "@/features/staff";
import { getCurrentTenant } from "@/features/tenants";
import { isSetupPassed } from "@/lib/setup/passed";
import { getServiceClient } from "@/lib/supabase/service";
import { nextReadyStep } from "./checklist";
import {
  nextCookieValue,
  resumeHref,
  safeNextPath,
  SETUP_NEXT_COOKIE,
  SETUP_NEXT_MAX_AGE,
  setupGate,
  type SetupGateDecision,
} from "./gate";
import { loadReadySteps } from "./ready-data";

export interface SetupGateState {
  decision: SetupGateDecision;
  /** Still gated for this owner: the page watches later in-app moves (layouts don't re-run). */
  watch: boolean;
}

const OPEN: SetupGateState = { decision: "open", watch: false };

/**
 * Setup first, then free (approved 20 Nov): the gate for one dashboard page load. Cheap for
 * everyone but a brand owner whose setup isn't passed: a role check, then one flag read.
 */
export async function setupGateFor(input: {
  tenantId: string;
  userId: string;
  /** The user's role in the brand's organization. */
  role: string | null;
  path: string;
}): Promise<SetupGateState> {
  if (input.role !== "owner") return OPEN;
  const db = getServiceClient();
  if (await isSetupPassed(db, input.tenantId)) return OPEN;
  const staff = (await staffAccess(db, input.userId)).role !== null;
  if (staff) return OPEN;
  return {
    decision: setupGate({ passed: false, role: input.role, staff, path: input.path }),
    watch: true,
  };
}

/**
 * The resume after the gate: setup at the open brand's first step not done (with the welcome
 * back), and the cookie that remembers the page asked for, when it's a safe one.
 */
export async function loadSetupResume(rawNext: string | null) {
  const tenant = await getCurrentTenant();
  const step = nextReadyStep(await loadReadySteps(tenant.id))?.n ?? 6;
  const next = safeNextPath(rawNext);
  return {
    href: resumeHref(step),
    cookie: next
      ? {
          name: SETUP_NEXT_COOKIE,
          value: nextCookieValue(tenant.id, next),
          options: {
            httpOnly: true,
            sameSite: "lax" as const,
            secure: process.env.NODE_ENV === "production",
            maxAge: SETUP_NEXT_MAX_AGE,
            path: "/",
          },
        }
      : null,
  };
}
