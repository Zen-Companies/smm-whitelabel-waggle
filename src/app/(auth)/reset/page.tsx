import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NewPasswordForm } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Choose a new password" };

// Opened from the reset email: /auth/confirm signed the person in first. Without that session the
// link was old or already used.
async function Form() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) redirect("/forgot?expired=1");
  return <NewPasswordForm email={data.user.email} />;
}

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="card h-72 w-full max-w-md" />}>
      <Form />
    </Suspense>
  );
}
