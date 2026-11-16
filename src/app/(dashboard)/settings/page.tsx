import { SettingsView, type SettingsProps } from "./settings-view";

export const metadata = { title: "Settings" };

/** /settings: Connected accounts, the section most visits are for. */
export default function SettingsPage({ searchParams }: SettingsProps) {
  return <SettingsView searchParams={searchParams} />;
}
