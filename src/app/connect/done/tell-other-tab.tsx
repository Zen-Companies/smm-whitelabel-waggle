"use client";

import { useEffect } from "react";
import { CONNECT_CHANNEL } from "@/features/accounts/client";

/** Tells the Waggle tab that started the connect that it's done, so it updates by itself. */
export function TellOtherTab({ id, ok }: { id: string; ok: boolean }) {
  useEffect(() => {
    try {
      const channel = new BroadcastChannel(CONNECT_CHANNEL);
      channel.postMessage({ id, ok });
      channel.close();
    } catch {
      // the other tab also refreshes when it gets focus again
    }
  }, [id, ok]);
  return null;
}
