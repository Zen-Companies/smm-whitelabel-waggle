"use client";

import { useEffect, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { choosePinterestBoard, loadPinterestBoards } from "./actions";
import type { PinterestBoard } from "./pinterest";

/**
 * "Which Pinterest board?" (design v3 "Composer: video and board"), opened in place from
 * "Change board". The choice is remembered for the account.
 */
export function BoardPicker({
  accountId,
  username,
  onDone,
}: {
  accountId: string;
  username: string | null;
  onDone: (board: PinterestBoard | null) => void;
}) {
  const [boards, setBoards] = useState<PinterestBoard[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void loadPinterestBoards(accountId).then((r) => {
      if (!live) return;
      if ("error" in r) return setError(r.error);
      setBoards(r.boards);
      setPicked(r.current ?? r.boards[0]?.id ?? null);
    });
    return () => {
      live = false;
    };
  }, [accountId]);

  async function save() {
    if (!picked) return;
    setSaving(true);
    const r = await choosePinterestBoard({ accountId, boardId: picked });
    setSaving(false);
    if ("error" in r) return setError(r.error);
    onDone(r.board);
  }

  return (
    <div
      role="group"
      aria-labelledby="board-picker-heading"
      className="border-ink flex flex-col gap-2.5 rounded-xl border-[1.5px] p-4"
    >
      <div className="flex items-center gap-2.5">
        <PlatformMark platform="pinterest" size={28} />
        <h4 id="board-picker-heading" className="text-[15px] font-semibold">
          Which Pinterest board?
        </h4>
      </div>
      <span className="text-ink-2 text-[13px]">
        Boards are the folders pins are saved in on Pinterest. These are @{username ?? "your"}
        &apos;s boards; the brand is still the one picked at the top.
      </span>
      {!boards && !error && <span className="text-ink-3 text-sm">Loading your boards…</span>}
      {boards && boards.length === 0 && (
        <span className="text-ink-2 text-sm">
          This account has no boards yet. Make one on Pinterest, then come back.
        </span>
      )}
      {boards && boards.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {boards.map((b) => (
            <li key={b.id}>
              <label
                className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 ${picked === b.id ? "bg-subtle font-semibold" : ""}`}
              >
                <input
                  type="radio"
                  name="pinterestBoard"
                  value={b.id}
                  checked={picked === b.id}
                  onChange={() => setPicked(b.id)}
                />
                {b.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      <span className="text-ink-3 text-xs">
        Waggle remembers the board for next time. New boards are made on Pinterest.
      </span>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!picked || saving || !boards?.length}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Use this board"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
