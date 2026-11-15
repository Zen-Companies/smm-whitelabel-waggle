import { AuthWall } from "@/features/auth";
import { AuthForm } from "@/features/tenants";
export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <div className="grid w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_448px]">
      <div className="hidden lg:block">
        <AuthWall kind="signup" />
      </div>
      <div className="flex justify-center">
        <AuthForm mode="signup" />
      </div>
    </div>
  );
}
