// The "messages" box every Waggle lead form ends with (T78c). Shared by Contacts (forms, adding a
// lead) and the lead email (T78d). Consent is never assumed: only a ticked box counts.

export const CONSENT_KEY = "waggle_messages";

export const leadConsented = (
  consents: { checkboxKey: string; isChecked: boolean }[] | null | undefined,
) => !!consents?.some((c) => c.checkboxKey === CONSENT_KEY && c.isChecked);
