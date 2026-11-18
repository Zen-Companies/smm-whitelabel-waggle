import { brandedEmail, honeyButton, paragraph } from "@/lib/email/frame";
import { ROLE_LABEL, type OrgRole } from "./abilities";

// The invite email (design v3 "Organizations", OrgInviteJoin). Pure, so it is unit tested.

export interface InviteEmailInput {
  orgName: string;
  inviterName: string;
  role: Exclude<OrgRole, "owner">;
  allBrands: boolean;
  brandNames: string[];
  email: string;
  expiresAt: Date;
  link: string;
  /** The address already has a login: "Join", not "Create your login to join". */
  hasLogin: boolean;
}

const WHAT_THEY_DO: Record<Exclude<OrgRole, "owner">, string> = {
  admin:
    "You'll be able to approve the replies Waggle drafts, schedule posts and change its settings.",
  member: "You'll be able to approve the replies Waggle drafts and schedule posts.",
  viewer: "You'll be able to see its inbox, leads and analytics.",
};

export function brandsPhrase(allBrands: boolean, brandNames: string[]): string {
  if (allBrands || brandNames.length === 0) return "all its brands";
  if (brandNames.length === 1) return brandNames[0];
  return `${brandNames.slice(0, -1).join(", ")} and ${brandNames[brandNames.length - 1]}`;
}

export function inviteEmail(input: InviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const role = ROLE_LABEL[input.role];
  const article = input.role === "admin" ? "an" : "a";
  const brands = brandsPhrase(input.allBrands, input.brandNames);
  const button = input.hasLogin ? `Join ${input.orgName}` : "Create your login to join";
  const until = input.expiresAt.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const subject = `${input.inviterName} invited you to ${input.orgName} on Waggle`;
  const lead = `${input.inviterName} invited you as ${article} ${role} for ${brands}.`;
  const fine = `This invite is for ${input.email} and works until ${until}. Not expecting it? Ignore this email; nothing is created until you accept.`;

  const text = [
    `Join ${input.orgName}`,
    "",
    `${lead} ${WHAT_THEY_DO[input.role]}`,
    "",
    `${button}: ${input.link}`,
    "",
    fine,
  ].join("\n");

  // Design "Waggle emails" (approved 18 Nov): the same frame as every Waggle email.
  const html = brandedEmail({
    eyebrow: { text: "You're invited", tone: "honey" },
    title: `Join ${input.orgName}`,
    bodyHtml:
      paragraph(`${lead} ${WHAT_THEY_DO[input.role]}`) +
      `<div style="margin:0 0 16px">${honeyButton(input.link, button)}</div>` +
      paragraph(fine, { muted: true }),
    businessName: input.orgName,
    because: "invited to Waggle",
    preheader: lead,
  });

  return { subject, text, html };
}
