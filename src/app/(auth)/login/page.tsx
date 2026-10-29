import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
