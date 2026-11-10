import { CreateOrgForm } from "@/features/orgs";

export const metadata = { title: "Create an organization" };

// T54 (design v3 "Organizations"): a new organization, with the user as its Owner.
export default function NewOrgPage() {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-4 py-10 md:py-14">
      <div className="flex flex-col gap-2">
        <h1 className="page-title">Create an organization</h1>
        <p className="text-ink-2 text-[15px]">
          An organization holds brands, the people who work on them, and one bill. You&apos;ll be
          its Owner and can invite your team next.
        </p>
      </div>
      <CreateOrgForm cancelHref="/inbox" />
    </main>
  );
}
