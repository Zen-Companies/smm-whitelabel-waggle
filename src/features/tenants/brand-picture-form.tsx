"use client";

import { useActionState, useState } from "react";
import { PicturePicker } from "@/components/app/picture-picker";
import { Button } from "@/components/ui/button";
import {
  saveBrandPicture,
  setBrandPictureSource,
  type PictureSourceState,
} from "./brand-picture-actions";
import { platformLabel } from "@/lib/social/platforms";
import type { PictureSource } from "./brand-picture";

/**
 * Business → Brand picture (T57, design OrgPictures): a connected account's picture (it follows
 * changes on the platform), an upload, or initials. Only inside Waggle: never changes the
 * picture on the social accounts.
 */
export function BrandPictureForm({
  source,
  accountId,
  accounts,
  uploadUrl,
  initials,
}: {
  source: PictureSource;
  accountId: string | null;
  accounts: { id: string; platform: string; username: string | null; hasPicture: boolean }[];
  uploadUrl: string | null;
  initials: string;
}) {
  const [state, action, pending] = useActionState<PictureSourceState, FormData>(
    setBrandPictureSource,
    {},
  );
  const [picked, setPicked] = useState<PictureSource>(source);
  const withPictures = accounts.filter((a) => a.hasPicture);
  const radio = "size-4 accent-[var(--ink)]";

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-1">
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="sr-only">Where the picture comes from</legend>
          <label className="flex min-h-10 flex-wrap items-center gap-2.5">
            <input
              type="radio"
              name="source"
              value="account"
              checked={picked === "account"}
              onChange={() => setPicked("account")}
              className={radio}
            />
            Use a connected account&apos;s picture
            {withPictures.length > 0 ? (
              <select
                name="accountId"
                aria-label="Account"
                defaultValue={accountId ?? withPictures[0].id}
                disabled={picked !== "account"}
                className="field ml-auto min-h-9 w-auto py-0 text-sm"
              >
                {withPictures.map((a) => (
                  <option key={a.id} value={a.id}>
                    {platformLabel(a.platform)}
                    {a.username ? ` @${a.username}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="meta">
                {accounts.length ? "(no account picture yet)" : "(connect an account first)"}
              </span>
            )}
          </label>
          <label className="flex min-h-10 items-center gap-2.5">
            <input
              type="radio"
              name="source"
              value="upload"
              checked={picked === "upload"}
              onChange={() => setPicked("upload")}
              className={radio}
            />
            Upload my own
          </label>
          <label className="flex min-h-10 items-center gap-2.5">
            <input
              type="radio"
              name="source"
              value="none"
              checked={picked === "none"}
              onChange={() => setPicked("none")}
              className={radio}
            />
            No picture (initials)
          </label>
        </fieldset>
        {picked !== "upload" && (
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" variant="secondary" disabled={pending}>
              Save
            </Button>
            {state.saved && !state.error && <span className="text-success text-sm">Saved</span>}
          </div>
        )}
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </form>
      {picked === "upload" && (
        <PicturePicker
          action={saveBrandPicture}
          fields={{}}
          currentUrl={uploadUrl}
          initials={initials}
          shape="circle"
          canRemove
        />
      )}
      <span className="meta">
        The account picture updates by itself when they change it on Instagram or Facebook. This
        never changes the picture on the social accounts.
      </span>
    </div>
  );
}
