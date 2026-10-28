"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { setupTenantForUser } from "./server";

export interface AuthFormState {
  error?: string;
  message?: string;
}

const signUpSchema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name").max(100),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
});

const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { businessName, email, password } = parsed.data;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { business_name: businessName },
      emailRedirectTo: `${process.env.APP_URL}/auth/confirm`,
    },
  });
  if (error) return { error: error.message };

  // With email confirmation on, an existing address comes back as a placeholder user with no
  // identities: nothing to set up. Otherwise the tenant is created now, and again (harmlessly)
  // on login or confirmation if this request dies half-way.
  if (data.user?.identities?.length) await setupTenantForUser(data.user);

  if (!data.session) return { message: "Check your email to confirm your account." };
  redirect("/settings");
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Wrong email or password." };

  await setupTenantForUser(data.user);
  redirect("/settings");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
