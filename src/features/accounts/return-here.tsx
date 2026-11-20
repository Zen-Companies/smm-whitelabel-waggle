"use client";

import { usePathname } from "next/navigation";

/**
 * A connect form's `back` field: the page it's on, so the connect comes back here (20 Nov).
 * The server checks it against the allowlist (connect-return.ts).
 */
export function ReturnHere() {
  const pathname = usePathname();
  return <input type="hidden" name="back" value={pathname} />;
}
