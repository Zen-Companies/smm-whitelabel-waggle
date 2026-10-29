"use client";

import { useEffect } from "react";
import { markItemNotificationsRead } from "./notification-actions";

/** Opening an item anywhere marks its notifications read (docs/design.md §5). */
export function MarkItemRead({ itemId }: { itemId: string }) {
  useEffect(() => {
    void markItemNotificationsRead(itemId);
  }, [itemId]);
  return null;
}
