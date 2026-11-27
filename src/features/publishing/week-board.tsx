"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { cn } from "cn";
import { EmptyCell } from "@/components/app/empty-spot";
import { movePostAction } from "./actions";
import { canDropOn, moveToDay } from "./move";
import { clockIn, shortWhen, wallClockIn } from "./post-time";

export interface WeekDay {
  key: string;
  weekday: string;
  dayNum: number;
  /** "Thursday, November 26" */
  long: string;
  isToday: boolean;
  /** The day the composer was opened for. */
  isPlanDay: boolean;
  planHref: string;
}

export interface WeekPost {
  id: string;
  day: string;
  href: string;
  firstLine: string;
  /** Posted, Planned, Needs you, Posting. */
  word: string;
  /** When it went out or goes out (ISO). */
  at: string | null;
  selected: boolean;
  /** A planned post Zernio holds: it can be dragged to another day. */
  movable: boolean;
  scheduledFor: string | null;
  /** Round 5: part of a repeat (↻). */
  repeats?: boolean;
}

type Moved = {
  id: string;
  from: string;
  to: string;
  toDay: string;
  status: "saving" | "done" | "undoing" | "error";
  error?: string;
};

/** Drag needs a mouse (phones use Move in the post panel). */
const finePointer = (onChange: () => void) => {
  const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/**
 * The week calendar (T74a), with drag to move (Posts Round 3, decision 1, approved 25 Nov): on a
 * computer a planned post can be dragged to another day; it keeps its time. The day under it says
 * "Drop to move to Thu 26 · 9:00 AM"; after the drop a line under the post says "Moved to … ·
 * Undo". Posted posts and days already past don't take part.
 */
export function WeekBoard({
  days,
  posts,
  timeZone,
  label,
}: {
  days: WeekDay[];
  posts: WeekPost[];
  timeZone: string;
  label: string;
}) {
  const canDrag = useSyncExternalStore(
    finePointer,
    () => window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    () => false,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [moved, setMoved] = useState<Moved | null>(null);
  const [, startTransition] = useTransition();
  const dragged = dragId ? posts.find((p) => p.id === dragId) : undefined;
  const dayOf = (p: WeekPost) =>
    moved && moved.id === p.id && moved.status !== "error" ? moved.toDay : p.day;
  const atOf = (p: WeekPost) =>
    moved && moved.id === p.id && moved.status !== "error" ? moved.to : p.at;
  const dropTime = (day: string) =>
    dragged?.scheduledFor ? moveToDay(dragged.scheduledFor, day, timeZone).toISOString() : null;
  const whenText = (iso: string) => {
    const w = wallClockIn(iso, timeZone);
    return shortWhen(w.day, w.time);
  };

  const drop = (day: string) => {
    const post = dragged;
    setDragId(null);
    setOverDay(null);
    if (
      !post?.scheduledFor ||
      !canDropOn({ scheduled_for: post.scheduledFor }, day, timeZone, new Date())
    )
      return;
    const from = post.scheduledFor;
    const to = moveToDay(from, day, timeZone).toISOString();
    setMoved({ id: post.id, from, to, toDay: day, status: "saving" });
    startTransition(async () => {
      const r = await movePostAction({ postId: post.id, scheduledFor: to });
      setMoved((m) =>
        m && m.id === post.id
          ? r.error
            ? { ...m, status: "error", error: r.error }
            : { ...m, to: r.scheduledFor ?? to, status: "done" }
          : m,
      );
    });
  };

  const undo = () => {
    if (!moved) return;
    const m = moved;
    setMoved({ ...m, status: "undoing" });
    startTransition(async () => {
      const r = await movePostAction({ postId: m.id, scheduledFor: m.from });
      setMoved(r.error ? { ...m, status: "done", error: r.error } : null);
    });
  };

  return (
    <div className="grid gap-3 md:grid-cols-7" aria-label={label}>
      {days.map((d) => {
        const list = posts.filter((p) => dayOf(p) === d.key);
        const droppable =
          !!dragged &&
          canDropOn({ scheduled_for: dragged.scheduledFor }, d.key, timeZone, new Date()) &&
          dayOf(dragged) !== d.key;
        const target = droppable && overDay === d.key ? dropTime(d.key) : null;
        return (
          <section
            key={d.key}
            aria-current={d.isToday ? "date" : undefined}
            onDragOver={(e) => {
              if (!droppable) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overDay !== d.key) setOverDay(d.key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOverDay((o) => (o === d.key ? null : o));
              }
            }}
            onDrop={(e) => {
              if (!droppable) return;
              e.preventDefault();
              drop(d.key);
            }}
            className={cn(
              "card flex min-h-[180px] min-w-0 flex-col gap-2 p-2.5",
              d.isPlanDay && "ring-honey ring-1",
              target && "ring-honey bg-honey-tint ring-2",
            )}
          >
            <p className="flex items-baseline gap-1.5 text-[13px]">
              <span className="text-ink-3">{d.weekday}</span>
              <span
                className={cn(
                  "font-semibold",
                  d.isToday &&
                    "bg-honey text-ink inline-flex min-w-[22px] justify-center rounded-full px-1",
                )}
              >
                {d.dayNum}
              </span>
            </p>
            {list.map((p) => {
              const at = atOf(p);
              const isMoved = moved?.id === p.id;
              return (
                <div key={p.id} className="flex flex-col gap-1">
                  <Link
                    href={p.href}
                    scroll={false}
                    draggable={canDrag && p.movable}
                    onDragStart={(e) => {
                      if (!canDrag || !p.movable) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", p.id);
                      setDragId(p.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverDay(null);
                    }}
                    aria-current={p.selected ? "true" : undefined}
                    aria-describedby={canDrag && p.movable ? "drag-hint" : undefined}
                    className={cn(
                      "text-ink flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-xs no-underline",
                      p.word === "Needs you"
                        ? "border-honey-border bg-honey-tint"
                        : p.word === "Posted"
                          ? "bg-subtle border-transparent"
                          : "border-line-strong bg-surface",
                      canDrag && p.movable && "cursor-grab active:cursor-grabbing",
                      dragId === p.id && "border-dashed opacity-50",
                      p.selected && "outline-ink outline-2",
                    )}
                  >
                    <span className="line-clamp-2 font-medium">
                      {p.repeats && (
                        <span className="text-honey-text" aria-label="Repeats: ">
                          ↻{" "}
                        </span>
                      )}
                      {p.firstLine}
                    </span>
                    <span className="text-ink-3">
                      {p.word}
                      {at && p.word !== "Needs you" ? ` · ${clockIn(at, timeZone)}` : ""}
                    </span>
                  </Link>
                  {isMoved && moved.status !== "error" && (
                    <p role="status" className="text-ink-2 text-xs">
                      {moved.status === "saving"
                        ? `Moving to ${whenText(moved.to)}…`
                        : moved.status === "undoing"
                          ? "Moving it back…"
                          : `Moved to ${whenText(moved.to)} · `}
                      {moved.status === "done" && (
                        <button type="button" onClick={undo} className="action-link text-xs">
                          Undo
                        </button>
                      )}
                      {moved.error && moved.status === "done" && (
                        <span className="text-danger block">{moved.error}</span>
                      )}
                    </p>
                  )}
                  {isMoved && moved.status === "error" && (
                    <p role="alert" className="text-danger text-xs">
                      Couldn&apos;t move it: {moved.error}
                    </p>
                  )}
                </div>
              );
            })}
            {target && (
              <p className="border-honey text-honey-text rounded-lg border border-dashed px-2 py-1.5 text-xs font-semibold">
                Drop to move to {whenText(target)}
              </p>
            )}
            {!target &&
              (list.length === 0 ? (
                // Rule 4 (option B): an empty day is one empty cell that fills on hover.
                <Link
                  href={d.planHref}
                  scroll={false}
                  aria-label={`Plan a post for ${d.long}`}
                  className="empty-slot"
                >
                  <EmptyCell size={36} />
                  <span className="empty-slot-text">Plan a post</span>
                </Link>
              ) : (
                <Link
                  href={d.planHref}
                  scroll={false}
                  aria-label={`Plan another post for ${d.long}`}
                  className="empty-slot mt-auto flex-none flex-row py-1.5"
                >
                  <EmptyCell size={18} />
                  <span className="empty-slot-text">Plan</span>
                </Link>
              ))}
          </section>
        );
      })}
      {canDrag && (
        <p id="drag-hint" className="sr-only">
          Drag to another day to move it; it keeps its time. Or open it and use Move.
        </p>
      )}
    </div>
  );
}
