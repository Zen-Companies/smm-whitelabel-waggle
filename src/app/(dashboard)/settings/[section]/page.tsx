import { SettingsView, type SettingsProps } from "../settings-view";

export const metadata = { title: "Settings" };

/** /settings/<section>: account, team, accounts, notifications… (src/lib/routes.ts). */
export default function SettingsSectionPage(props: SettingsProps) {
  return <SettingsView {...props} />;
}
