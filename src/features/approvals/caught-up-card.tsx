import Link from "next/link";
import { Bee } from "@/components/app/bee";
import { clockTime } from "@/components/app/time";
import { activitySubject, type ActivityEntry, snippet } from "./today-activity";

/**
 * The empty For you tab (design v3 "Inbox empty · B"): the list column stays, and the space where
 * a conversation would be shows the bee and what Waggle did today.
 */
export function CaughtUpCard({ activity }: { activity: ActivityEntry[] }) {
  return (
    <section
      aria-labelledby="caught-up"
      className="border-line flex min-w-0 flex-col gap-6 rounded-2xl border px-6 py-8 md:px-10"
    >
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
        <Bee scene="caught-up" className="-my-2" />
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
          <h2 id="caught-up" className="display-title">
            All caught up
          </h2>
          <p className="text-ink-2">
            Nothing needs you. Go run the shop; we&apos;ll email you when a customer does.
          </p>
        </div>
      </div>
      {activity.length > 0 && (
        <div className="border-subtle flex flex-col gap-1 border-t pt-4">
          <h3 className="text-[13px] font-semibold">What Waggle did today</h3>
          <ul className="flex flex-col">
            {activity.map((a) => (
              <li
                key={`${a.what}-${a.itemId}`}
                className="border-subtle flex items-baseline gap-3 border-b py-2.5"
              >
                <span className="meta w-16 shrink-0 tabular-nums">{clockTime(a.at)}</span>
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">{a.what === "answered" ? "Answered" : "Ignored"}</b>{" "}
                  {activitySubject(a)}
                  {a.what === "answered" && <span className="text-ink-2">: {snippet(a.text)}</span>}
                </span>
                <Link
                  href={`/inbox?tab=${a.what}&item=${a.itemId}`}
                  className="text-[13px] font-medium"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/inbox?tab=answered" className="pt-1.5 text-[13px] font-medium">
            All answered
          </Link>
        </div>
      )}
    </section>
  );
}
