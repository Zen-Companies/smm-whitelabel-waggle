import { can } from "@/features/orgs";
import { getCurrentTenant, ReadOnlyNote } from "@/features/tenants";
import { slotsToGrid } from "./queue";
import { loadQueue } from "./queue-data";
import { PostsHeader } from "./posts-header";
import { QueueForm } from "./queue-form";

/** Posts → Queue (T75): the brand's posting times. */
export async function QueueView() {
  const tenant = await getCurrentTenant();
  const queue = await loadQueue(tenant.zernioProfileId);
  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <PostsHeader />
        <h2 className="section-title mt-2">Posting times</h2>
        <p className="text-ink-2">
          Pick “Next free slot” when you write a post and it goes out at the next of these times.
        </p>
      </div>
      {can(tenant.role, "posts.write") ? (
        <QueueForm
          initialGrid={slotsToGrid(queue?.slots ?? [])}
          timezone={queue?.timezone ?? null}
          nextSlots={queue?.nextSlots ?? []}
        />
      ) : (
        <ReadOnlyNote role={tenant.role} what="the posting times" />
      )}
    </div>
  );
}
