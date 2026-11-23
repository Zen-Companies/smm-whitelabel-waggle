import { SetupLoading } from "@/components/app/setup-loading";

// Any setup page that waits (board "Setup, start to finish", approved 23 Nov): the bee and three
// combs filling, not grey skeletons.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[640px] px-4">
      <SetupLoading />
    </main>
  );
}
