// Customer text goes into prompts between <message> and </message> (CLAUDE.md rule 8: data, not
// instructions). A customer could type those tags to close the block early and write "instructions"
// after it, so any message tag in their text is neutralised first (T29).
const MESSAGE_TAG = /<\s*\/?\s*message\b[^>]*>/gi;

export function asMessageData(text: string): string {
  return text.replace(MESSAGE_TAG, "[tag removed]");
}
