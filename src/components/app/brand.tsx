/**
 * The Waggle wordmark (docs/design.md §2): `waggle` as text, lowercase, Inter 700, with a honey
 * full stop. Built as text, never an image of the word.
 */
export function Brand() {
  return (
    <span className="wordmark text-[19px]">
      waggle<span className="text-honey">.</span>
    </span>
  );
}
