// What being out of replies means right now (Walter, 20 Nov; decision 9): how often customers
// write (a day, from the last 7 days) and how many wait for the owner now (the Inbox badge).
// Shown as two plain tiles on the out-of-replies pop-up, never in alarm red. Pure.

export interface ReplyPain {
  /** Customer messages a day, the last 7 days' average, rounded; 0 under one a day. */
  perDay: number;
  /** Messages waiting for the owner now (the Inbox badge, "N need you"). */
  waiting: number;
}

/** Pure: the average a day from a week's count; 0 when it's under one a day. */
export function perDayFromWeek(count: number): number {
  return count < 7 ? 0 : Math.round(count / 7);
}

export interface PainTile {
  /** The figure: "~18" or "8". */
  n: string;
  text: string;
}

/** Pure: the tiles worth showing. The messages-a-day tile hides under one a day. */
export function painTiles(p: ReplyPain | null | undefined): PainTile[] {
  if (!p) return [];
  const tiles: PainTile[] = [];
  if (p.perDay >= 1) {
    tiles.push({ n: `~${p.perDay.toLocaleString("en-US")}`, text: "messages a day from customers" });
  }
  if (p.waiting > 0) {
    tiles.push({ n: p.waiting.toLocaleString("en-US"), text: "waiting for a reply right now" });
  }
  return tiles;
}

/** Pure: the banner's sentence, e.g. "27 messages are waiting for a reply." */
export function waitingLine(waiting: number): string | null {
  if (waiting <= 0) return null;
  return waiting === 1
    ? "1 message is waiting for a reply."
    : `${waiting.toLocaleString("en-US")} messages are waiting for a reply.`;
}
