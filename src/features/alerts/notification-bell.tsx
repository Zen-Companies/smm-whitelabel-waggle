"use client";

import { Bell, CircleAlert, CircleCheck, Inbox, Megaphone, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { shortTime } from "@/components/app/time";
import { cn } from "cn";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification-actions";
import type { NotificationTone, NotificationView } from "./notifications";

type Tab = "all" | "needs" | "updates";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "For you" },
  { key: "updates", label: "Updates" },
];

/** 36px type circles (design.md §6). */
const TONE: Record<NotificationTone, string> = {
  lead: "bg-banner text-honey",
  attention: "bg-danger-soft text-alert",
  success: "bg-success-soft text-success",
  post: "bg-hive-high text-wax",
};
function TypeIcon({ n }: { n: NotificationView }) {
  const Icon =
    n.kind === "lead"
      ? UserRound
      : n.kind === "auto_sent"
        ? CircleCheck
        : n.kind === "replies_waiting"
          ? Inbox
          : n.kind === "post_published"
            ? Megaphone
            : CircleAlert;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        TONE[n.tone],
      )}
    >
      <Icon strokeWidth={1.75} className="size-[18px]" />
    </span>
  );
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * The bell (44px icon button) with a honey count of unread items that need the owner, and the
 * notification panel (overlay, 22px radius, ~420px): All / For you / Updates, grouped
 * Today / Earlier (docs/design.md §6).
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const r = await fetchNotifications();
      setItems(r.items);
      setUnread(r.unread);
    });
  }, []);

  // Keep the badge fresh (no Realtime for notifications: rule 15), and on every navigation.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        fetchUnreadCount()
          .then(setUnread)
          .catch(() => {});
      }
    };
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const shown = (items ?? []).filter((n) =>
    tab === "all" ? true : tab === "needs" ? n.needsAction : !n.needsAction,
  );
  const groups = [
    { label: "Today", list: shown.filter((n) => isToday(n.at)) },
    { label: "Earlier", list: shown.filter((n) => !isToday(n.at)) },
  ].filter((g) => g.list.length > 0);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} need you` : "Notifications"}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) reload();
        }}
        className="bg-hive-raised border-line-strong hover:bg-hive-high relative inline-flex size-11 items-center justify-center rounded-lg border transition-colors duration-150"
      >
        <Bell strokeWidth={1.75} className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="bg-honey text-hive absolute -top-1.5 -right-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="overlay fixed inset-x-3 top-16 z-50 flex max-h-[min(640px,calc(100dvh-5rem))] flex-col md:absolute md:inset-x-auto md:top-0 md:left-14 md:w-[420px]"
        >
          <div className="flex items-center justify-between gap-2 px-5 pt-5">
            <h2 className="text-[22px] font-bold">Notifications</h2>
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="hover:text-wax text-wax-muted min-h-11 px-2 text-sm font-medium underline underline-offset-4"
                onClick={() =>
                  startTransition(async () => {
                    await markAllNotificationsRead();
                    reload();
                    router.refresh();
                  })
                }
              >
                Mark all read
              </button>
              <button
                type="button"
                aria-label="Close"
                className="text-wax-muted hover:bg-hive-high inline-flex size-11 items-center justify-center rounded-md"
                onClick={() => setOpen(false)}
              >
                <X strokeWidth={1.75} className="size-5" aria-hidden />
              </button>
            </span>
          </div>
          <div className="segmented mx-5 mt-3 self-start" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                data-active={tab === t.key || undefined}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
            {items === null ? (
              <div className="flex flex-col gap-3 p-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="skeleton size-9 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="skeleton h-4 w-2/3" />
                      <div className="skeleton h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className="meta px-2 py-8 text-center">
                {tab === "needs" ? "Nothing needs you right now." : "No notifications yet."}
              </p>
            ) : (
              groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3 className="meta px-2 pt-3 pb-1">{g.label}</h3>
                  <ul className="flex flex-col">
                    {g.list.map((n) => (
                      <li key={n.id}>
                        <Link
                          href={n.href}
                          onClick={() => {
                            setOpen(false);
                            if (n.unread) {
                              markNotificationRead(n.id).then(() =>
                                fetchUnreadCount().then(setUnread),
                              );
                            }
                          }}
                          className="hover:bg-hive-high flex items-start gap-3 rounded-md px-2 py-3"
                        >
                          <TypeIcon n={n} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span
                              className={cn("text-sm", n.unread ? "font-semibold" : "font-medium")}
                            >
                              {n.title}
                            </span>
                            <span className="meta truncate">
                              {n.meta ? `${n.meta} · ` : ""}
                              {shortTime(n.at)}
                            </span>
                            {n.action && (
                              <span className="text-honey mt-1 text-sm font-medium">
                                {n.action}
                              </span>
                            )}
                          </span>
                          {n.unread && (
                            <span
                              aria-label="Unread"
                              className="bg-honey mt-2 size-2 shrink-0 rounded-full"
                            />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
