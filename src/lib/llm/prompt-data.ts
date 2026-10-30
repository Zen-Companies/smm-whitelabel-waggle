// Customer text goes into prompts between <message> and </message>, and earlier thread messages
// between <earlier> and </earlier> (CLAUDE.md rule 8: data, not instructions). A customer could
// type those tags to close a block early and write "instructions" after it, so any such tag in
// their text is neutralised first (T29, T30).
const DATA_TAG = /<\s*\/?\s*(?:message|earlier)\b[^>]*>/gi;

export function asMessageData(text: string): string {
  return text.replace(DATA_TAG, "[tag removed]");
}
