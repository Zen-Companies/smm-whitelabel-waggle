"use server";

import * as Sentry from "@sentry/nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signInNext } from "@/features/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { queueForOwners, queueQuietly } from "@/lib/crm";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { afterSignupPath } from "@/lib/checkout-link";
import { ORG_COOKIE } from "@/features/orgs";
import { BRAND_COOKIE } from "./brand-pick";
import { PASSWORD_MIN } from "./password";
import { getTenantFor, NOT_ALLOWED } from "./current-tenant";
import { recordSignupPlan, setupTenantForUser } from "./server";
import { emailConfirmState, RESEND_AFTER_MS, sendEmailConfirmation } from "./email-confirm";

export interface AuthFormState {
  error?: string;
  message?: string;
}

// T54: a login is just a person. The business comes in as a brand on /welcome.
const signUpSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name").max(100, "Keep it under 100 characters"),
    email: z.email("Enter a valid email"),
    password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "The passwords don't match",
    path: ["confirmPassword"],
  });

/** The plan picked on the site's plan card (25 Nov); anything else is no plan. */
const signupPlanSchema = z.enum(["solo", "team"]);

const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, email, password } = parsed.data;
  const planParse = signupPlanSchema.safeParse(formData.get("plan"));
  const start = planParse.success ? planParse.data : null;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.APP_URL}/auth/confirm`,
    },
  });
  if (error) return { error: error.message };

  // With email confirmation on, an existing address comes back as a placeholder user with no
  // identities: nothing to set up. Otherwise the personal organization is made now, and again
  // (harmlessly) on login or confirmation if this request dies half-way.
  if (data.user?.identities?.length) {
    const { organizationId } = await setupTenantForUser(data.user);
    if (start) {
      await recordSignupPlan({ organizationId, userId: data.user.id, start, via: "email" });
    }
  }

  if (!data.session) return { message: "Check your email to confirm your account." };
  // Confirm later (hotfix 21 Nov): Supabase's confirm is off, so this login works now; Waggle
  // sends its own link. A failed send never blocks the signup ("Send again" is on every page).
  if (data.user?.email) {
    await sendEmailConfirmation(getServiceClient(), {
      id: data.user.id,
      email: data.user.email,
      name: fullName,
    }).catch((e: unknown) => Sentry.captureException(e));
  }
  // With a plan from the site (25 Nov): setup's first page opens Checkout for it, then setup.
  redirect(afterSignupPath(start));
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Wrong email or password." };

  await setupTenantForUser(data.user);
  redirect(signInNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  // The open brand and organization belong to this login; the next one starts on its own.
  const store = await cookies();
  store.delete(BRAND_COOKIE);
  store.delete(ORG_COOKIE);
  redirect("/login");
}

export type ProfileFormState = { saved?: boolean; error?: string };

const profileSchema = z
  .string()
  .trim()
  .max(BUSINESS_PROFILE_MAX, "Keep it under 1,000 characters.");

/** Settings → Business: the description Waggle sorts messages with (T25). */
export async function updateBusinessProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = profileSchema.safeParse(formData.get("profile") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenants")
    .update({ business_profile: parsed.data })
    .eq("id", tenant.id);
  if (error) return { error: "Couldn't save. Try again." };
  // Rule 11; the text itself stays out of the audit row.
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "business_profile_changed",
    actor: tenant.userId,
    details: { length: parsed.data.length },
  });
  // CRM: the first time an organization saves its business info (once per organization).
  if (parsed.data.length > 0) {
    await queueQuietly(() =>
      queueForOwners(getServiceClient(), tenant.organizationId, {
        event: "business_info_saved",
        dedupeKey: `business_info_saved:${tenant.organizationId}`,
      }),
    );
  }
  revalidatePath("/settings", "layout");
  return { saved: true };
}

export type ResendState = { sent?: boolean; error?: string };

/** "Send again" on the confirm line: a new link to the login's current email, once a minute. */
export async function resendEmailConfirmation(): Promise<ResendState> {
  const user = await getCurrentUser();
  if (!user.email) return { error: "Your login has no email address." };
  const db = getServiceClient();
  const state = await emailConfirmState(db, user.id);
  if (!state.pending) return { sent: true };
  if (state.sentAt && Date.now() - Date.parse(state.sentAt) < RESEND_AFTER_MS) {
    return { error: "We just sent it. Give it a minute, then try again." };
  }
  try {
    await sendEmailConfirmation(db, {
      id: user.id,
      email: user.email,
      name: (user.user_metadata?.full_name as string | undefined) ?? null,
    });
  } catch (e) {
    Sentry.captureException(e);
    return { error: "That didn't send. Try again in a moment." };
  }
  return { sent: true };
}
