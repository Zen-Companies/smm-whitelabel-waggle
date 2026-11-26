import { Check } from "lucide-react";

/**
 * Back on the Inbox after paying when out of replies (Playbook round 2, 26 Nov): "Waggle is
 * answering again. Writing replies for 7 messages." Said in place, never a toast.
 */
export function RepliesBackLine({ count }: { count: number }) {
  return (
    <p
      role="status"
      className="bg-success-soft text-success m-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px]"
    >
      <Check className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>
        <b className="font-semibold">Waggle is answering again.</b>
        {count > 0
          ? ` Writing replies for ${count === 1 ? "1 message" : `${count.toLocaleString("en-US")} messages`}.`
          : ""}
      </span>
    </p>
  );
}
