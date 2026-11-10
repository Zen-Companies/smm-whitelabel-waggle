import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { ComposeForm } from "./compose-form";

/**
 * The composer, always beside the calendar (design v2). `day` comes from a clicked day; `time`
 * from an Analytics best time (T51).
 */
export async function ComposeCard({
  day = null,
  time = null,
}: {
  day?: string | null;
  time?: string | null;
}) {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .order("created_at");
  return (
    <section className="card-lifted flex flex-col gap-4 p-5" aria-labelledby="compose-heading">
      <div className="flex flex-col">
        <h2 id="compose-heading" className="section-title">
          New post
        </h2>
        {day && (
          <span className="meta">
            For{" "}
            {new Date(`${day}T12:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
      {can(tenant.role, "posts.write") ? (
        <ComposeForm
          key={`${day ?? "any"}-${time ?? ""}`}
          accounts={accounts ?? []}
          day={day}
          time={time}
        />
      ) : (
        <ReadOnlyNote role={tenant.role} what="the posts" />
      )}
    </section>
  );
}
