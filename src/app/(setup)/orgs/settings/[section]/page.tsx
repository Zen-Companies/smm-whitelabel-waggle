import { OrgSettingsView, type OrgSettingsProps } from "../org-settings-view";

export const metadata = { title: "Organization settings" };

/** /orgs/settings/<section>: account, general, team or billing. */
export default function OrgSettingsSectionPage(props: OrgSettingsProps) {
  return <OrgSettingsView {...props} />;
}
