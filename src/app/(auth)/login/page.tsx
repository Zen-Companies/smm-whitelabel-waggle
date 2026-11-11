import { Suspense } from "react";
import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Sign in" };

// `next`: an AI assistant's consent page sends people here first (MCP); the action checks it.
async function Form({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      next={typeof next === "string" ? next : undefined}
      error={typeof error === "string" ? error : undefined}
    />
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<AuthForm mode="login" />}>
      <Form {...props} />
    </Suspense>
  );
}
