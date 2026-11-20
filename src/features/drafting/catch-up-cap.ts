// First connect (decided 20 Nov): the drafting cost cap for pulled items. A catch-up drafts at
// most REVEAL_DRAFTS (20) of what it pulled, newest questions and leads first; the rest are
// sorted by Jev but not drafted until the owner opens one. The draft step enforces it with this
// rule: a pulled item is drafted only once a draft was asked for (draft_requested_at), by the
// catch-up's finishing pass (the reveal's 20) or by the owner opening it ("draft on open").

export function holdPulledItem(item: {
  /** Set when the item was pulled by a first-connect catch-up (not a webhook). */
  catchUpId: string | null;
  draftRequestedAt: string | null;
}): boolean {
  return item.catchUpId !== null && item.draftRequestedAt === null;
}
