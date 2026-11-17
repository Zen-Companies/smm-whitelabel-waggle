"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { listOneDriveAction, pickOneDriveAction, type OneDriveList } from "./actions";
import { StateLabel } from "@/components/app/state-mark";

const mb = (bytes: number | null) =>
  bytes === null
    ? ""
    : bytes >= 1024 ** 2
      ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1024)} KB`;

export type DrivePick = { use: "image" | "video"; url: string; name: string; size: number };

/**
 * Add from OneDrive (design "Posts: files from Drive and OneDrive"): browse and search the brand's
 * OneDrive inside Waggle; the picked file is copied into post media. Google Drive is held.
 */
export function OneDrivePicker({
  onPick,
  disabled,
  allow,
  showSoon = true,
}: {
  /** False inside the drop zone, which shows Google Drive on its own line. */
  showSoon?: boolean;
  onPick: (pick: DrivePick) => void;
  disabled?: boolean;
  /** What the post can still take (a photo post can't add a video, and the other way round). */
  allow: { image: boolean; video: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<OneDriveList | null>(null);
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [loading, start] = useTransition();

  const load = (folderId?: string, search?: string) =>
    start(async () => {
      setError(null);
      setList(await listOneDriveAction({ folderId, q: search }));
    });

  const use = (id: string, kind: "image" | "video") =>
    start(async () => {
      setCopying(id);
      setError(null);
      const r = await pickOneDriveAction({ fileId: id, use: kind });
      setCopying(null);
      if ("error" in r) return setError(r.error);
      onPick({ use: kind, ...r });
      setOpen(false);
    });

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            setTrail([]);
            setQ("");
            load();
          }}
          className="gap-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo */}
          <img src="/brands/onedrive.svg" alt="" width={18} height={18} className="shrink-0" />
          OneDrive
        </Button>
        {showSoon && <StateLabel state="soon">Google Drive, coming soon</StateLabel>}
      </div>
    );
  }
  const folder = trail[trail.length - 1];
  return (
    <div className="border-line flex w-full flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo */}
        <img src="/brands/onedrive.svg" alt="" width={18} height={18} className="shrink-0" />
        <b className="text-sm">OneDrive</b>
        <span className="meta flex-1 truncate">
          {["My files", ...trail.map((t) => t.name)].join(" / ")}
        </span>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              load(undefined, q);
            }
          }}
          placeholder="Search OneDrive"
          aria-label="Search OneDrive"
          className="field min-w-0 flex-1"
        />
        <Button type="button" variant="secondary" onClick={() => load(undefined, q)}>
          Search
        </Button>
        {(trail.length > 0 || q) && (
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              const up = trail.slice(0, -1);
              setTrail(up);
              setQ("");
              load(up[up.length - 1]?.id);
            }}
          >
            Back
          </Button>
        )}
      </div>
      {loading && !copying && <p className="meta">Loading…</p>}
      {list && "error" in list && (
        <p className="text-danger text-sm">
          {list.error}{" "}
          {list.connect && (
            <Link href="/settings/accounts" className="action-link with-arrow">
              Open Accounts
            </Link>
          )}
        </p>
      )}
      {list &&
        "items" in list &&
        !loading &&
        (list.items.length ? (
          <ul className="divide-line flex max-h-72 flex-col divide-y overflow-y-auto">
            {list.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
                <span aria-hidden>
                  {item.use === "folder" ? "📁" : item.use === "video" ? "🎬" : "🖼️"}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.name}</span>
                  {item.use !== "folder" && (
                    <span className="meta">
                      {mb(item.size)}
                      {item.tooBig
                        ? item.use === "video"
                          ? " · too big here: upload it from your device"
                          : " · over 5 MB"
                        : ""}
                    </span>
                  )}
                </span>
                {item.use === "folder" ? (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => {
                      setTrail([...trail, { id: item.id, name: item.name }]);
                      setQ("");
                      load(item.id);
                    }}
                  >
                    Open
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={item.tooBig || !allow[item.use] || !!copying}
                    onClick={() => use(item.id, item.use as "image" | "video")}
                  >
                    {copying === item.id ? "Adding…" : "Use"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">
            {q
              ? "Nothing matches."
              : folder
                ? "This folder has no photos or videos."
                : "No photos or videos here."}
          </p>
        ))}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
