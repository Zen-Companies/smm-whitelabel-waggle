import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social";
import type { ServiceClient } from "@/lib/supabase/service";

// T64: the board a brand's pins go to. Chosen in the composer ("Change board"), remembered on
// the account, and sent with every pin. Without one Zernio pins to the account's first board.

export interface PinterestBoard {
  id: string;
  name: string;
}

async function pinterestAccount(db: ServiceClient, tenantId: string, accountId: string) {
  const { data } = await db
    .from("social_accounts")
    .select("id, zernio_account_id, platform, status, pinterest_board_id")
    .eq("tenant_id", tenantId)
    .eq("id", accountId)
    .maybeSingle();
  return data && data.platform === "pinterest" && data.status === "active" ? data : null;
}

/** The account's boards from Pinterest, and which one Waggle uses now. */
export async function listBoardsFor(
  deps: { db: ServiceClient; social: SocialProvider },
  input: { tenantId: string; accountId: string },
): Promise<{ boards: PinterestBoard[]; current: string | null } | null> {
  const account = await pinterestAccount(deps.db, input.tenantId, input.accountId);
  if (!account) return null;
  const boards = await deps.social.listPinterestBoards({
    accountId: account.zernio_account_id,
    signal: AbortSignal.timeout(15_000),
  });
  return { boards, current: account.pinterest_board_id };
}

/** Remembers a board for the account. Only one of its own boards (checked with Pinterest). */
export async function chooseBoardFor(
  deps: { db: ServiceClient; social: SocialProvider },
  input: { tenantId: string; actor: string; accountId: string; boardId: string },
): Promise<{ ok: true; board: PinterestBoard } | { ok: false; error: "not_found" }> {
  const listed = await listBoardsFor(deps, input);
  const board = listed?.boards.find((b) => b.id === input.boardId);
  if (!board) return { ok: false, error: "not_found" };
  const { error } = await deps.db
    .from("social_accounts")
    .update({ pinterest_board_id: board.id, pinterest_board_name: board.name })
    .eq("id", input.accountId)
    .eq("tenant_id", input.tenantId);
  if (error) throw new Error(`pinterest board save failed: ${error.message}`);
  await writeAudit(deps.db, {
    tenantId: input.tenantId,
    action: "pinterest_board_chosen",
    actor: input.actor,
    details: { accountId: input.accountId, boardId: board.id },
  });
  return { ok: true, board };
}
