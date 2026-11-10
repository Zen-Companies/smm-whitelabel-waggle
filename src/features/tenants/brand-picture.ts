// Which picture a brand shows (T57, design OrgPictures). Pure, so it is unit tested.

export type PictureSource = "account" | "upload" | "none";

export interface PictureAccount {
  id: string;
  picture_path: string | null;
}

/**
 * "account": the chosen account's copy, or the first connected account that has one (a new
 * brand takes the first account's picture). "upload": the uploaded one. "none": initials.
 */
export function brandPicturePath(
  brand: { picture_source: string; picture_path: string | null; picture_account_id: string | null },
  accounts: readonly PictureAccount[],
): string | null {
  if (brand.picture_source === "upload") return brand.picture_path;
  if (brand.picture_source === "none") return null;
  const chosen = accounts.find((a) => a.id === brand.picture_account_id && a.picture_path);
  return (chosen ?? accounts.find((a) => a.picture_path))?.picture_path ?? null;
}
