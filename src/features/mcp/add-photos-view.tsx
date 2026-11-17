import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { uploadState } from "./add-photos";
import { AddPhotosForm, type AddedFile } from "./add-photos-form";

// Waggle's "Add photos for your post" page (design "AI assistants · Add photos from a chat",
// approved 17 Nov): opened from a link an AI assistant gave the owner. Phone first.

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-6">
      <h1 className="font-display text-[22px] font-semibold">{title}</h1>
      <div className="text-ink-2 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export async function AddPhotosView({ uploadId }: { uploadId: string }) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return (
      <Note title="Sign in to add your photos">
        <p>Sign in to Waggle with the account you connected to your AI assistant.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/add-photos/${uploadId}`)}`}
          className="bg-honey text-ink w-fit rounded-md px-4 py-2 text-sm font-semibold"
        >
          Sign in
        </Link>
      </Note>
    );
  }

  const db = getServiceClient();
  const { data: row } = /^[0-9a-f-]{36}$/i.test(uploadId)
    ? await db
        .from("media_uploads")
        .select("id, tenant_id, created_by, client_id, files, expires_at, done_at")
        .eq("id", uploadId)
        .maybeSingle()
    : { data: null };
  if (!row) {
    return (
      <Note title="This link doesn't work">
        <p>Ask your AI assistant for a new link to add photos.</p>
      </Note>
    );
  }
  const state = uploadState(row, auth.user.id, new Date());
  if (state === "not_yours") {
    return (
      <Note title="This link is someone else's">
        <p>It belongs to another Waggle account. Ask your assistant for your own link.</p>
      </Note>
    );
  }
  const [{ data: brand }, { data: grant }] = await Promise.all([
    db.from("tenants").select("name").eq("id", row.tenant_id).maybeSingle(),
    db
      .from("mcp_grants")
      .select("client_name")
      .eq("user_id", auth.user.id)
      .eq("client_id", row.client_id)
      .limit(1)
      .maybeSingle(),
  ]);
  const assistant = grant?.client_name ?? "your assistant";
  if (state === "done") {
    return (
      <Note title="Your photos are added">
        <p>
          Go back to {assistant} and say <b>done</b>. It will show you the post before anything goes
          out.
        </p>
      </Note>
    );
  }
  if (state === "expired") {
    return (
      <Note title="This link has expired">
        <p>Links to add photos last 30 minutes. Ask {assistant} for a new one.</p>
      </Note>
    );
  }
  return (
    <section className="card flex flex-col gap-4 p-5 md:p-6">
      <div className="flex flex-col gap-1">
        <span className="meta">{brand?.name}</span>
        <h1 className="font-display text-[24px] font-semibold">Add photos for your post</h1>
        <p className="text-ink-2">
          For the post you&apos;re writing with {assistant}. They&apos;re only used for that post.
        </p>
      </div>
      <AddPhotosForm
        uploadId={row.id}
        initial={(row.files as unknown as AddedFile[]) ?? []}
        assistant={assistant}
      />
    </section>
  );
}
