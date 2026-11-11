import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { pageInfo, TYPE_LABEL, type FeedbackType } from "./pages";

/** Your requests (design v3 FeedbackRequests): what this login sent the team, newest first. */
export async function RequestsView() {
  const user = await getCurrentUser();
  const { data } = await getServiceClient()
    .from("feedback")
    .select("id, page, type, message, follow_up, created_at")
    .eq("user_id", user.id)
    .eq("kind", "note")
    .order("created_at", { ascending: false })
    .limit(200);
  const notes = data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">
        What you&apos;ve sent the Waggle team. Replies come by email to {user.email}. To send a new
        one, use the Feedback button at the bottom right of any page.
      </p>
      {notes.length === 0 ? (
        <p className="card text-ink-2 p-5">
          Nothing yet. Your notes will show here once you send one.
        </p>
      ) : (
        <ul className="flex flex-col">
          {notes.map((n) => (
            <li key={n.id} className="border-line flex flex-col gap-1 border-b py-3.5">
              <span className="flex flex-wrap items-baseline gap-2">
                {n.type && (
                  <span className="bg-subtle text-ink-2 rounded-full px-2 py-0.5 text-xs">
                    {TYPE_LABEL[n.type as FeedbackType]}
                  </span>
                )}
                <span className="meta">
                  {new Date(n.created_at).toLocaleString("en-PH", {
                    timeZone: "Asia/Manila",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · from {pageInfo(`/${n.page}`).name}
                </span>
              </span>
              <span className="whitespace-pre-line">{n.message}</span>
              {n.follow_up && (
                <span className="text-ink-2 text-sm whitespace-pre-line">{n.follow_up}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <a href="/inbox" className={buttonVariants({ variant: "quiet", className: "w-fit" })}>
        Back to Waggle
      </a>
    </div>
  );
}
