// Small shared parts of setup's screens. Step 3's paged screens (batch, need-you, how) became one
// chat (board "Step 3 is a conversation with Waggle", 23 Nov): their parts went with them.

const AVATAR_COLORS = ["#C2185B", "#6D4C41", "#1E5AA8", "#2E7D32", "#7B1FA2", "#B45309", "#0F766E"];

/** Pure: the same colour for the same person. */
export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** A DM's avatar: the first letter of the handle on a colour of its own (DMs read as chats). */
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const letter = name.replace(/^@/, "").charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="inline-flex flex-none items-center justify-center rounded-full text-[12px] font-semibold text-white"
      style={{ width: size, height: size, background: avatarColor(name) }}
    >
      {letter}
    </span>
  );
}
