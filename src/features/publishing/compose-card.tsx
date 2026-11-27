import { SidePanel } from "@/components/app/side-panel";
import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { platformOf } from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import type { BestChip } from "./best-chips";
import { ComposeForm, type ComposeInitial, type ComposeMode } from "./compose-form";
import { loadQueue } from "./queue-data";
import { businessPhone } from "./google-post";

/**
 * New post, Edit post and Duplicate in the big window (Posts Round 3, approved 25 Nov). `day`
 * comes from a clicked day; `time` from an Analytics best time (T51); `initial` is the post being
 * edited or copied.
 */
export async function ComposeCard({
  day = null,
  time = null,
  mode = "new",
  initial = null,
  title,
  subtitle,
  closeHref,
  doneHref,
  timeZone,
  chips,
  busyDays,
}: {
  day?: string | null;
  time?: string | null;
  mode?: ComposeMode;
  initial?: ComposeInitial | null;
  title: string;
  subtitle?: string;
  closeHref: string;
  doneHref: string;
  timeZone: string;
  chips: BestChip[] | null;
  busyDays: string[];
}) {
  const tenant = await getCurrentTenant();
  if (!can(tenant.role, "posts.write")) {
    return (
      <SidePanel label={title} closeHref={closeHref}>
        <ReadOnlyNote role={tenant.role} what="the posts" />
      </SidePanel>
    );
  }
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
  // Round 4: Google's Call now dials the business phone from Business info.
  const phone = (accounts ?? []).some((a) => a.platform === "googlebusiness")
    ? businessPhone(
        (
          await supabase
            .from("kb_entries")
            .select("title, content, found_kind")
            .eq("tenant_id", tenant.id)
            .limit(500)
        ).data ?? [],
      )
    : null;
  return (
    <ComposeForm
      key={`${mode}-${initial?.postId ?? ""}-${day ?? "any"}-${time ?? ""}`}
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
      mode={mode}
      initial={initial}
      title={title}
      subtitle={subtitle}
      closeHref={closeHref}
      doneHref={doneHref}
      timeZone={timeZone}
      chips={chips}
      busyDays={busyDays}
      businessPhone={phone}
    />
  );
}
