import { cn } from "cn";

/**
 * The loading screen (approved 18 Nov, canvas "Loading", option B2): a big `waggle.` whose letters
 * ripple while the honey dot hops like a bee, the page's own words underneath, and a thin honey
 * bar under the top bar. Appears only after 0.3 s, so fast pages never flash it. With reduced
 * motion it's the still wordmark and the words. Server-safe (CSS only).
 */
export function PageLoading({ words, className }: { words: string; className?: string }) {
  return (
    <div
      className={cn("page-loading mx-auto w-full max-w-[1320px] px-4 md:px-6", className)}
      role="status"
      aria-live="polite"
    >
      <div className="page-loading-bar" aria-hidden />
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-6 py-16 md:min-h-[520px]">
        <div
          className="font-display text-ink text-6xl leading-none font-bold tracking-tight md:text-8xl"
          aria-hidden
        >
          {"waggle".split("").map((ch, i) => (
            <span key={i} className="page-loading-letter" style={{ animationDelay: `${i * 90}ms` }}>
              {ch}
            </span>
          ))}
          <span className="page-loading-dot text-honey">.</span>
        </div>
        <p className="font-display text-ink text-lg font-semibold md:text-xl">{words}…</p>
      </div>
    </div>
  );
}

/** The words for each part of the app (canvas "Loading" rules). */
export const LOADING_WORDS = {
  today: "Getting Today ready",
  inbox: "Opening your inbox",
  contacts: "Finding your contacts",
  posts: "Lining up your posts",
  teach: "Opening Teach Waggle",
  insights: "Counting the numbers",
  settings: "Opening Settings",
  plan: "Opening your plan",
  admin: "Opening the admin pages",
  brands: "Getting things ready",
} as const;
