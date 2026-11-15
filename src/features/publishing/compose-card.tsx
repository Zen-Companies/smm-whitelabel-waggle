import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { platformOf } from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import { ComposeForm } from "./compose-form";
import { loadQueue } from "./queue-data";

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
  const [{ data: accounts }, { data: down }] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("id, platform, username, pinterest_board_id, pinterest_board_name")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("created_at"),
    // T74a: accounts that stopped connecting show as "Reconnect to post here".
    supabase
      .from("social_accounts")
      .select("platform, username")
      .eq("tenant_id", tenant.id)
      .eq("status", "disconnected")
      .order("created_at"),
  ]);
  const queue = await loadQueue(tenant.zernioProfileId);
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
          // WhatsApp (and anything else without a feed) can't take posts.
          accounts={(accounts ?? [])
            .filter((a) => platformOf(a.platform)?.post)
            .map((a) => ({
              id: a.id,
              platform: a.platform,
              username: a.username,
              pinterestBoard: a.pinterest_board_id
                ? { id: a.pinterest_board_id, name: a.pinterest_board_name ?? "your board" }
                : null,
            }))}
          day={day}
          time={time}
          nextSlot={queue?.nextSlots[0] ?? null}
          brandName={tenant.name}
          disconnected={(down ?? []).filter((a) => platformOf(a.platform)?.post)}
        />
      ) : (
        <ReadOnlyNote role={tenant.role} what="the posts" />
      )}
    </section>
  );
}
