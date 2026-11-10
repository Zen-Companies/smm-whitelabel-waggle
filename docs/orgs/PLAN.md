# Organizations: build plan (T53–T58)

Decided 2026-11-10 on the access-model page (https://claude.ai/artifact/5gZ3HV3xBKNiLTL34eAfbK);
screens approved on the v3 canvas, row "Organizations" (OrgSignup, OrgSwitcher, OrgTeam,
OrgInviteJoin, OrgInviteStates, OrgGeneral, OrgPictures). The canvas is the UI spec.

## Decisions

- An **organization** holds brands, members, invites, the bill and the picture. A brand (tenant)
  belongs to exactly one organization.
- Every new login gets a **personal organization** ("<Name>'s Organization") at sign-up, as Owner.
  Sign-up asks only name, email, password.
- Roles: **owner, admin, member, viewer** (matrix below). At least one owner per organization.
- **Only these brands**: admin, member and viewer can be limited to some brands. Owners see all.
  "All brands" includes brands added later.
- **Invites** are stored by email, so they work for an email with no login. 7-day expiry, only for
  that email, resend/cancel, accept/decline. The link to someone without a login opens sign-up
  with the email locked; signing up joins and lands in the inviting organization.
- **Billing** belongs to the organization (Owner only). T15 isn't built, so v1 shows counts and
  "set with billing (T15)"; no prices.
- Offboarding per brand (T21, as built) and per organization (close = offboard all its brands).
  The last owner can't leave or delete their login until another member is owner.
- Pictures: organization picture is uploaded (or initials). Brand picture: a connected account's
  picture (Zernio `SocialAccount.profilePicture`, may be null; copied to our storage because
  platform URLs expire), an upload, or initials.

## Role matrix (pure function, `features/orgs/abilities.ts`)

| Ability | owner | admin | member | viewer |
|---|---|---|---|---|
| inbox.read, leads/analytics read | ✓ | ✓ | ✓ | ✓ |
| replies.approve (approve/edit/send/hide/resolve), posts.write | ✓ | ✓ | ✓ | – |
| brand.settings (business info, reply rules, KB, lab settings) | ✓ | ✓ | – | – |
| accounts.manage (connect/remove) | ✓ | ✓ | – | – |
| brands.add | ✓ | ✓ | – | – |
| team.manage (invite/remove/change role, not owners) | ✓ | ✓ (not owners) | – | – |
| org.settings (rename, picture) | ✓ | ✓ | – | – |
| billing.view (details) | ✓ | – | – | – |
| org.close, brand.close | ✓ | – | – | – |
| ai.connect (MCP) | ✓ | ✓ | as member | read only |

## Data model

- `organizations` (id, name, picture_path, personal_of uuid null, created_by, created_at,
  closed_at).
- `organization_members` (organization_id, user_id, role, all_brands bool, created_at).
- `organization_member_brands` (organization_id, user_id, tenant_id): used when all_brands = false.
- `organization_invites` (id, organization_id, email citext, role, all_brands, tenant_ids uuid[],
  token_hash, invited_by, created_at, expires_at, accepted_at, accepted_by, declined_at,
  cancelled_at).
- `tenants.organization_id` not null; `tenants.picture_source` ('account' | 'upload' | 'none'),
  `picture_path`, `picture_account_id`.
- **`tenant_members` stays** as the effective access list (one row per user per brand, role
  widened to the four roles). It is rebuilt only by `private.sync_org_access(org_id)`, called from
  every organization function. RLS (`private.user_tenant_ids()`), MCP grants, alerts and
  offboarding keep reading it unchanged. Direct writes to it are revoked.
- Migration: one personal organization per existing owner login, holding all brands they own.

## Phases

1. **T53 Data model** – tables, RLS, sync function, security definer functions
   (`create_personal_org`, `create_organization`, `create_brand` in an org, invite / accept /
   decline / cancel, change role / brands, remove, leave, last-owner guard), backfill, pgTAP +
   integration tests, regenerated types.
2. **T54 Sign-up and switcher** – sign-up without business name, personal org, first screen
   (waiting invites, add first brand, create organization), switcher Organization / Brand, org
   cookie, Add a brand into the open org.
3. **T55 Roles enforced** – abilities matrix + tests; `getCurrentTenant` returns role; every
   Server Action checks its ability; write RLS policies use the role; UI hides what a role can't
   do; Settings split into Organization / Brand; alerts go to owner/admin/member.
4. **T56 Team and invites** – Settings → Team, invite panel, invite email (Resend), `/invite/[token]`
   join page and its states, audit rows.
5. **T57 Organization settings and pictures** – General (rename, picture, billing counts, leave,
   close, only-owner warning), brand picture (account / upload / initials), storage bucket,
   profilePicture sync from Zernio.
6. **T58 AI assistants by role** – MCP tools check the member's abilities (viewer read only).

Each phase: tests first for pure logic, `pnpm typecheck && pnpm lint && pnpm test`, pgTAP and
integration tests, local commit. Push only when the user says (push to main = hosted migration +
prod deploy).

## Out of scope for v1

Staff "Organizations" view, moving a brand between organizations, prices (T15), SSO.
