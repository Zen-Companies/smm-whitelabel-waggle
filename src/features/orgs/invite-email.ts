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

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

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

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Inter,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;padding:28px 32px">
<p style="margin:0 0 16px;font-weight:700;font-size:19px;letter-spacing:-0.03em">waggle<span style="color:#f5b014">.</span></p>
<h1 style="margin:0 0 12px;font-size:22px;font-weight:600">Join ${esc(input.orgName)}</h1>
<p style="margin:0 0 20px;line-height:1.5;color:#3f3f46">${esc(lead)} ${esc(WHAT_THEY_DO[input.role])}</p>
<p style="margin:0 0 20px"><a href="${esc(input.link)}" style="display:inline-block;background:#f5b014;color:#18181b;font-weight:600;text-decoration:none;padding:12px 18px;border-radius:8px">${esc(button)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#71717a">${esc(fine)}</p>
</div></div></body></html>`;

  return { subject, text, html };
}
