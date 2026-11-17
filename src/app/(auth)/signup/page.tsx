import { AuthSplit } from "@/features/auth";
import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <AuthSplit kind="signup">
      <AuthForm mode="signup" />
    </AuthSplit>
  );
}
