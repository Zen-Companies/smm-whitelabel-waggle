import Link from "next/link";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <nav className="mx-auto flex w-full max-w-2xl gap-4 px-6 pt-6 text-sm">
        <Link href="/inbox">Inbox</Link>
        <Link href="/knowledge-base">Knowledge base</Link>
        <Link href="/settings">Settings</Link>
      </nav>
      {children}
    </>
  );
}
