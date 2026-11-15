import { cn } from "cn";

// The wall beside sign in and sign up (T74e, design "0 · Sign in" and "0b · Sign up"). Sign in is
// for people who already use Waggle: tips that make it work better. Sign up is for people
// deciding whether to trust it: the cost of slow replies, then proof they stay in control. Stats
// verified 13 Nov (Sprout Social Index 2025; Meta and Kantar 2025). The selfie videos and the
// drifting motion are left out: still cards, nothing moves.

type Card = {
  kick: string;
  num?: string;
  title: string;
  sub: string;
  steps?: string[];
  src?: string;
  tone?: "honey" | "ink";
};

const SIGN_IN: Card[] = [
  {
    kick: "Tip",
    title: "Approve replies from your phone",
    sub: "Replies waiting for your OK show on Today. One tap each, even between appointments.",
    tone: "honey",
  },
  {
    kick: "Tip",
    title: "Teach it your top 5 answers",
    sub: "The more answers Waggle has, the less lands on you:",
    steps: ["Hours and location", "Prices, or a starting price", "How to book"],
  },
  {
    kick: "Keep it safe",
    title: "Some questions should always come to you",
    sub: "Keep these on Ask me first:",
    steps: ["Refunds and complaints", "Custom prices", "Health or legal questions"],
    tone: "ink",
  },
  {
    kick: "Good to know",
    num: "24 h",
    title: "to reply on Instagram and Messenger",
    sub: "Meta lets a business reply freely for 24 hours after the customer last messaged. Clear Today before it closes.",
    tone: "honey",
  },
  {
    kick: "Why it matters",
    num: "3 in 4",
    title: "customers expect a reply within 24 hours",
    sub: "Every reply you approve today keeps a buyer from moving on.",
    src: "Sprout Social Index, 2025",
  },
  {
    kick: "Going away?",
    title: "One button pauses every reply",
    sub: "Vacation or a busy week: pause Waggle in Teach Waggle, and everything waits for you.",
    tone: "ink",
  },
];

const SIGN_UP: Card[] = [
  {
    kick: "The cost of waiting",
    num: "73%",
    title: "say they will buy from a competitor if a business does not answer on social",
    sub: "A slow reply is not neutral. It sends the customer to the next business.",
    src: "Sprout Social Index, 2025",
    tone: "honey",
  },
  {
    kick: "How Waggle works",
    title: "Set up in three steps",
    sub: "You write the answers. You set the rules. Waggle gets them out fast.",
    steps: [
      "Connect where customers message you",
      "Write your top answers",
      "Choose Ask me first or Reply on its own",
    ],
  },
  {
    kick: "The cost of waiting",
    num: "3 in 4",
    title: "expect a reply within 24 hours",
    sub: "The first business to answer usually gets the booking.",
    src: "Sprout Social Index, 2025",
    tone: "ink",
  },
  {
    kick: "You stay in charge",
    num: "0",
    title: "made-up prices",
    sub: "If the answer isn't in what you wrote, Waggle asks you first instead of guessing.",
    tone: "honey",
  },
  {
    kick: "Where customers are",
    num: "7 in 10",
    title: "would rather message a business than call it",
    sub: "Your DMs are the new phone line.",
    src: "Meta and Kantar, 2025 (Meta-commissioned)",
  },
  {
    kick: "You stay in charge",
    title: "These always come to you",
    sub: "Waggle never answers them on its own:",
    steps: ["Complaints and refunds", "Custom prices", "Health or legal questions"],
    tone: "ink",
  },
];

function WallCard({ card }: { card: Card }) {
  const ink = card.tone === "ink";
  const honey = card.tone === "honey";
  return (
    <article
      className={cn(
        "mb-4 break-inside-avoid rounded-[18px] border p-5",
        honey && "border-honey bg-honey text-[#17140f]",
        ink && "border-ink bg-ink text-surface",
        !card.tone && "border-line bg-surface",
      )}
    >
      <p
        className={cn(
          "mb-3 text-[11px] font-bold tracking-[0.7px] uppercase",
          honey ? "text-[#4a3000]" : ink ? "text-honey" : "text-honey-text",
        )}
      >
        {card.kick}
      </p>
      {card.num && (
        <p
          className={cn(
            "font-display text-[40px] leading-none font-extrabold tracking-[-1.5px]",
            ink && "text-honey",
          )}
        >
          {card.num}
        </p>
      )}
      <h3 className="font-display mt-2 mb-1.5 text-[17px] leading-snug font-semibold">
        {card.title}
      </h3>
      <p className={cn("text-sm", honey ? "text-[#3a2a00]" : ink ? "opacity-80" : "text-ink-2")}>
        {card.sub}
      </p>
      {card.steps && (
        <ol className="mt-3 flex flex-col gap-2 text-sm">
          {card.steps.map((s, i) => (
            <li key={s} className="flex items-start gap-2.5">
              <b
                className={cn(
                  "inline-flex size-[22px] flex-none items-center justify-center rounded-full text-xs",
                  honey
                    ? "bg-ink text-honey"
                    : ink
                      ? "bg-honey text-[#17140f]"
                      : "bg-honey-tint text-honey-text",
                )}
              >
                {i + 1}
              </b>
              {s}
            </li>
          ))}
        </ol>
      )}
      {card.src && (
        <p
          className={cn(
            "mt-3.5 text-xs",
            honey ? "text-[#4a3000]" : ink ? "opacity-70" : "text-ink-3",
          )}
        >
          {card.src}
        </p>
      )}
    </article>
  );
}

export function AuthWall({ kind }: { kind: "signin" | "signup" }) {
  const cards = kind === "signin" ? SIGN_IN : SIGN_UP;
  return (
    <aside aria-label={kind === "signin" ? "Tips" : "Why Waggle"} className="columns-2 gap-4">
      {cards.map((c) => (
        <WallCard key={c.title} card={c} />
      ))}
    </aside>
  );
}
