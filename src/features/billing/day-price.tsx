// A plan's price as what it costs a day (Walter, 20 Nov; decision 4): "about $1.61 a day", big
// in honey on a dark strip with a honey glow so it catches the eye. DayBanner on the pop-ups,
// DayPill on Your plan's cards. Never for Business (priced on a call).

/** The pop-ups' price banner: "about $1.61 a day" and what it's of ("$49 a month after …"). */
export function DayBanner({ amount, of }: { amount: string; of: string }) {
  return (
    <div className="bg-ink text-page relative flex w-full items-center gap-3.5 overflow-hidden rounded-xl px-4 py-3 shadow-[0_8px_22px_rgba(246,178,27,0.30)]">
      <span
        aria-hidden
        className="bg-honey/35 pointer-events-none absolute -top-10 -right-8 size-32 rounded-full blur-2xl"
      />
      <span
        aria-hidden
        className="bg-honey/15 text-honey relative grid size-11 shrink-0 place-items-center rounded-full text-2xl leading-none"
      >
        ⬢
      </span>
      <span className="relative flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-sm font-medium opacity-80">about</span>
          <span className="font-display text-honey text-[34px] leading-none font-bold tracking-[-0.02em]">
            {amount}
          </span>
          <span className="text-[15px] font-semibold">a day</span>
        </span>
        <span className="text-sm font-medium opacity-75">{of}</span>
      </span>
    </div>
  );
}

/** A plan card's daily price: a small dark pill, the figure in honey. */
export function DayPill({ amount }: { amount: string }) {
  return (
    <span className="bg-ink text-page relative inline-flex items-baseline gap-1.5 self-start overflow-hidden rounded-full px-3.5 py-1.5 shadow-[0_6px_16px_rgba(246,178,27,0.28)]">
      <span
        aria-hidden
        className="bg-honey/35 pointer-events-none absolute -top-6 -right-4 size-16 rounded-full blur-xl"
      />
      <span className="relative text-xs font-medium opacity-80">about</span>
      <span className="font-display text-honey relative text-xl leading-none font-bold">
        {amount}
      </span>
      <span className="relative text-xs font-semibold">a day</span>
    </span>
  );
}
