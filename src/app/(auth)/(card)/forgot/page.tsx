import { Suspense } from "react";
import { ForgotPasswordForm } from "@/features/tenants";

export const metadata = { title: "Reset your password" };

async function Form({ searchParams }: PageProps<"/forgot">) {
  const { expired } = await searchParams;
  return <ForgotPasswordForm expired={expired === "1"} />;
}

// Forgot password (design v3 "Sign-in and account").
export default function ForgotPage(props: PageProps<"/forgot">) {
  return (
    <Suspense fallback={<ForgotPasswordForm expired={false} />}>
      <Form {...props} />
    </Suspense>
  );
}
