import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { ConfirmEmailLineView } from "./confirm-email-line-view";
import { emailConfirmState } from "./email-confirm";

/** "Confirm your email when you can", on every page until confirmed (hotfix 21 Nov). */
export async function ConfirmEmailLine({ className }: { className?: string }) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const state = await emailConfirmState(getServiceClient(), data.user.id);
  if (!state.pending) return null;
  return (
    <div className={className}>
      <ConfirmEmailLineView email={data.user.email ?? state.email ?? ""} />
    </div>
  );
}
