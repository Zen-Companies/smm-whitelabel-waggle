import { Brand } from "@/components/app/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      <Brand />
      {children}
    </main>
  );
}
