import Link from "next/link";
import { BeeDance } from "@/components/app/bee-setup";
import { StateMark } from "@/components/app/state-mark";
import { WELCOME_HREF } from "@/features/billing";
import { PRIMARY } from "./setup-frame";

// The end of setup (board "Setup, start to finish", approved 23 Nov): still in the setup frame,
// the bee dances once, "You're set up, <name>", what's done as honey cells, and one button.

export function DoneScreen({ firstName, lines }: { firstName: string; lines: string[] }) {
  return (
    <div className="part-in flex flex-col items-center gap-4 pt-2">
      <BeeDance scale={0.5} />
      <h1 className="font-display text-center text-[22px] leading-tight font-semibold md:text-[26px]">
        You’re set up, {firstName}
      </h1>
      <ul className="card flex w-full flex-col gap-2 px-4 py-3 text-[13.5px]">
        {lines.map((l) => (
          <li key={l} className="flex items-center gap-2">
            <StateMark state="working" size={13} />
            {l}
          </li>
        ))}
      </ul>
      <Link href={WELCOME_HREF} className={`${PRIMARY} no-underline`}>
        Go to my Inbox
      </Link>
    </div>
  );
}
