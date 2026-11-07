import { Chip } from "@/components/app/chip";
import { ROLE_LABELS, staffPagesFor } from "./pages";
import { currentStaffAccess } from "./staff";
import { StaffTabs } from "./staff-tabs";

/** The strip under the top bar on staff pages: the role, then the pages it may open. */
export async function StaffStrip() {
  const access = await currentStaffAccess();
  if (!access.role) return null;
  const pages = staffPagesFor(access.permissions).map(({ href, label }) => ({ href, label }));
  return (
    <div className="border-line bg-subtle border-b">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-8">
        <Chip tone="blue">Staff only · {ROLE_LABELS[access.role]}</Chip>
        <StaffTabs pages={pages} />
      </div>
    </div>
  );
}
