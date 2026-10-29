import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
