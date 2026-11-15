import { Suspense } from "react";
import { AuthWall } from "@/features/auth";
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
    <div className="grid w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_448px]">
      <div className="hidden lg:block">
        <AuthWall kind="signin" />
      </div>
      <div className="flex justify-center">
        <Suspense fallback={<AuthForm mode="login" />}>
          <Form {...props} />
        </Suspense>
      </div>
    </div>
  );
}
