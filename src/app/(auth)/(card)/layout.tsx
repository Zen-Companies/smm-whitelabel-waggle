import { Brand } from "@/components/app/brand";

// Forgot and reset password: one centered card under the wordmark.
export default function CardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      <Brand />
      {children}
    </div>
  );
}
