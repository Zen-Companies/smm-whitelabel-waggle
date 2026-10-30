import Image from "next/image";

/**
 * The Waggle wordmark (docs/design.md §2): the small trail mark plus `waggle` as text, lowercase,
 * with a honey full stop. Built as text, never an image of the word.
 */
export function Brand() {
  return (
    <span className="flex items-center gap-2">
      <Image src="/brand/waggle-mark-small.svg" alt="" width={30} height={20} aria-hidden />
      <span className="wordmark text-[23px]">
        waggle<span className="text-honey">.</span>
      </span>
    </span>
  );
}
