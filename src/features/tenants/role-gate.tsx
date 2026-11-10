import { Eye } from "lucide-react";
import { ROLE_LABEL, type OrgRole } from "@/features/orgs";

export function article(role: OrgRole): string {
  return role === "owner" || role === "admin" ? "an" : "a";
}

/** "You're a Viewer here, so you can see the reply rules but not change them." */
export function ReadOnlyNote({ role, what }: { role: OrgRole; what: string }) {
  return (
    <p
      role="note"
      className="text-ink-2 bg-subtle/60 flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm"
    >
      <Eye className="text-ink-3 mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>
        You&apos;re {article(role)} {ROLE_LABEL[role]} here, so you can see {what} but not change{" "}
        {what.endsWith("s") ? "them" : "it"}. Ask an Owner or Admin.
      </span>
    </p>
  );
}

/**
 * T55: shows `children` as they are when the role may change them; otherwise the same controls,
 * disabled, under a note saying why. The Server Actions refuse anyway; this keeps the page honest.
 */
export function RoleGate({
  allowed,
  role,
  what,
  children,
}: {
  allowed: boolean;
  role: OrgRole;
  what: string;
  children: React.ReactNode;
}) {
  if (allowed) return children;
  return (
    <div className="flex flex-col gap-3">
      <ReadOnlyNote role={role} what={what} />
      <fieldset disabled className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 opacity-75">
        {children}
      </fieldset>
    </div>
  );
}
