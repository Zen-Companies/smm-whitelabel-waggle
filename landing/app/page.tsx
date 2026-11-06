import { FIGURE_8, Mark, Wordmark } from "./components/brand";
import { GuideBee } from "./components/guide-bee";
import { CalendarPanel, InboxPanel, LeadsPanel, LoopDiagram, TodayPanel } from "./components/mockups";
import { Nav } from "./components/nav";
import { PLATFORM_NAMES, Platforms } from "./components/platforms";
import { RevealObserver } from "./components/reveal";
import { APP_URL } from "./lib/site";

// hint: what the guide bee says when it waggles at this section.
// flower: the most important sections get a flower, and the bee lands on it instead of waggling.
function Act({ n, label, hint, flower = false }: { n: string; label: string; hint: string; flower?: boolean }) {
  return (
    <div data-reveal data-bee-stop={hint} className="act-label">
      {n} · {label}
      {flower && <Flower />}
    </div>
  );
}

// Kit colours only: Honey petals edged in the full-stop colour, a Hive centre, a Pollen stem
function Flower() {
  return (
    <svg className="act-flower" width="36" height="45" viewBox="0 0 32 40" aria-hidden="true">
      <path d="M16 40 C16 32 15 26 16 20" stroke="#B9A988" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="11" cy="31" rx="4.5" ry="2.2" fill="#B9A988" transform="rotate(-30 11 31)" />
      <g className="bloom">
        {[0, 60, 120, 180, 240, 300].map((r) => (
          <ellipse key={r} cx="16" cy="7.5" rx="4" ry="6.5" fill="#F6B21B" stroke="var(--stop)" strokeWidth="1" transform={`rotate(${r} 16 14)`} />
        ))}
        <circle cx="16" cy="14" r="4.2" fill="#17140F" />
      </g>
    </svg>
  );
}

function PrimaryCta({ children = "Start free", ...rest }: { children?: React.ReactNode } & React.ComponentProps<"a">) {
  return (
    <a
      {...rest}
      href={`${APP_URL}/signup`}
      className="inline-flex h-16 w-full items-center justify-center gap-2 rounded-full bg-honey px-10 text-xl font-semibold text-hive shadow-[0_14px_30px_-12px_rgb(246_178_27/0.9)] transition hover:-translate-y-0.5 hover:bg-honey-glow sm:w-auto"
    >
      {children} <span aria-hidden="true">→</span>
    </a>
  );
}

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-honey focus:px-4 focus:py-2 focus:text-hive">
        Skip to content
      </a>
      <Nav />
      <RevealObserver />
      <GuideBee />

      <main id="main">
        <Hero />
        <Shift />
        <Problem />
        <HowItWorks />
        <Rules />
        <WhatsNext />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

/* ───────────────────────── Hero (brand kit: Facebook cover) ───────────────────────── */

// The cover's figure-8, in its own 1640 × 624 frame
const COVER_8 = "M820,312 C930,140 1320,90 1320,312 C1320,534 930,484 820,312 C710,140 320,90 320,312 C320,534 710,484 820,312Z";
const COVER_RIGHT_LOOP = "M820,312 C930,140 1320,90 1320,312 C1320,534 930,484 820,312";

function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-[radial-gradient(ellipse_55%_90%_at_50%_50%,var(--bg-cream),var(--bg)_75%)] px-4 pt-32 pb-20 dark:bg-[radial-gradient(ellipse_55%_90%_at_50%_50%,#2e2719,#17140f_75%)] sm:pt-36 lg:pb-28"
    >
      <svg
        viewBox="0 0 1640 624"
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute top-1/2 left-1/2 w-[1640px] max-w-none -translate-x-1/2 -translate-y-[42%]"
        aria-hidden="true"
      >
        {/* the dotted trail stays on the outer loop, so it never runs behind the copy */}
        <mask id="hero-trail">
          <rect x="1190" width="450" height="624" fill="#fff" />
        </mask>
        <path d={COVER_8} fill="none" stroke="var(--honey)" strokeOpacity=".1" strokeWidth="60" strokeLinejoin="round" />
        <path d={COVER_RIGHT_LOOP} mask="url(#hero-trail)" fill="none" stroke="var(--honey)" strokeOpacity=".35" strokeWidth="6" strokeDasharray="2 18" strokeLinecap="round" />
      </svg>

      <div className="relative mx-auto grid max-w-7xl items-center gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,600px)_minmax(0,1fr)] xl:gap-8">
        {/* left loop: a customer asks */}
        <div data-reveal style={{ "--d": "300ms" } as React.CSSProperties} className="order-2 mx-auto w-full max-w-[330px] rounded-[18px] border border-line bg-surface px-[18px] py-4 text-[17px] leading-snug shadow-card xl:order-1 xl:mx-0">
          <div className="text-sm font-semibold text-muted">New comment on Instagram</div>
          <div className="mt-1.5">Are you open Sunday?</div>
        </div>

        {/* centre: the promise */}
        <div className="order-1 mb-10 flex flex-col items-center gap-6 text-center xl:order-2 xl:mb-0">
          {/* SEO/AEO: the h1 carries the category phrase people search and ask for; the brand line stays the display text */}
          <h1 data-reveal style={{ "--d": "100ms" } as React.CSSProperties}>
            <span className="block text-[15px] font-semibold text-accent sm:text-lg">
              AI social media manager for small businesses
            </span>
            <span className="mt-4 block text-[3.6rem] leading-[1.02] font-bold tracking-[-0.03em] sm:text-7xl lg:text-[6rem]">
              Your socials,
              <br />
              handled<span className="text-[var(--stop)]">.</span>
            </span>
          </h1>
          {/* one plain sentence that answers "what is Waggle?", so search and AI answers can quote it whole */}
          <p data-reveal style={{ "--d": "200ms" } as React.CSSProperties} className="max-w-xl text-xl leading-relaxed text-balance text-soft sm:text-[22px]">
            Waggle schedules your posts, answers comments and DMs from your business info, and tells you which customers
            are ready to buy.
          </p>
          {/* one primary action (honey), one quiet way in for readers not ready yet */}
          <div data-reveal style={{ "--d": "280ms" } as React.CSSProperties} className="mt-2 flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row sm:gap-4">
            <a
              href={`${APP_URL}/signup`}
              className="inline-flex h-16 w-full items-center justify-center gap-2 rounded-full bg-honey px-10 text-[22px] font-semibold text-hive shadow-[0_14px_30px_-12px_rgb(246_178_27/0.9)] transition hover:-translate-y-0.5 hover:bg-honey-glow sm:w-auto"
            >
              Start free <span aria-hidden="true">→</span>
            </a>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center justify-center px-4 text-lg font-semibold text-ink underline-offset-4 transition hover:underline"
            >
              See how it works
            </a>
          </div>
          <p data-reveal style={{ "--d": "340ms" } as React.CSSProperties} className="text-sm text-muted">
            14 days free. You approve every reply until you trust it.
          </p>
        </div>

        {/* right loop: Waggle answers */}
        <div data-reveal style={{ "--d": "400ms" } as React.CSSProperties} className="order-3 mx-auto w-full max-w-[330px] rounded-[18px] bg-honey px-[18px] py-4 text-[17px] leading-snug text-hive shadow-card xl:mx-0 xl:ml-auto">
          <div className="text-sm font-bold">Waggle replied in 6s</div>
          <div className="mt-1.5">Yes! Sunday 8am to 2pm.<br />See you there.</div>
        </div>
      </div>

      {/* set apart at the foot of the hero, so it reads as proof and not as more to take in */}
      <div data-reveal style={{ "--d": "460ms" } as React.CSSProperties} className="relative mt-16 lg:mt-24">
        <Platforms />
      </div>
    </section>
  );
}

/* ───────────────────────── 01 · The shift ───────────────────────── */

const STATS = [
  { pre: "~", n: "6", unit: "seconds", body: "to answer a regular question like opening hours, prices or parking. From your info, never made up." },
  { pre: "", n: "24", unit: "hours", body: "Instagram's reply window. Waggle never sends twice, and never sends after it closes." },
  { pre: "", n: "8", unit: "second undo", body: "on every reply you approve. Check it with one key, take it back if you change your mind." },
  { pre: "", n: "0", unit: "made-up prices", body: "If it isn't in your business info, Waggle asks you instead of guessing." },
];

const OLD_NEW = [
  { topic: "Posting", old: "Whenever you remember, usually late at night", now: "The month planned in one sitting, published on time" },
  { topic: "Comments and DMs", old: "Answered hours later, after they booked elsewhere", now: "Answered in seconds, from what you wrote" },
  { topic: "Buyers", old: "Lost somewhere in a thread", now: "In one list, with what they asked for, emailed to you" },
];

function Shift() {
  return (
    <section className="bg-cream px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Act n="01" label="The shift" hint="Start here" />
        <h2 data-reveal className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
          Your customers are already in your comments.
        </h2>
        <p data-reveal className="mt-6 max-w-2xl text-lg text-soft">
          People ask the shop before they visit it: on Instagram, on Facebook, at 11pm. Whoever answers first gets the booking.
        </p>

        <div className="mt-20 space-y-20 sm:space-y-28">
          {STATS.map((s, i) => (
            <div key={s.unit} data-reveal className={`flex flex-col gap-4 ${i % 2 ? "items-end text-right" : "items-start"}`}>
              <div className="flex items-baseline font-semibold tracking-[-0.05em] leading-none">
                {s.pre && <span className="text-6xl text-muted sm:text-8xl">{s.pre}</span>}
                <span className="text-[6.5rem] text-ink sm:text-[10rem]">{s.n}</span>
                <span className="ml-3 text-3xl tracking-[-0.02em] text-accent sm:text-5xl dark:text-honey">{s.unit}</span>
              </div>
              <p className="max-w-md text-lg text-soft">{s.body}</p>
            </div>
          ))}
        </div>

        <div data-reveal className="mt-28 flex justify-center">
          <div className="rounded-[2rem] border border-line bg-bg p-3 shadow-card sm:p-4">
            <TodayPanel />
          </div>
        </div>

        <blockquote data-reveal className="mx-auto mt-24 max-w-3xl text-center text-3xl leading-snug font-medium tracking-[-0.02em] sm:text-4xl">
          “You run the shop. <span className="text-accent dark:text-honey">We’ll run the comments.</span>”
        </blockquote>
      </div>

      <div className="mx-auto mt-28 max-w-6xl">
        <h3 data-reveal className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          <span className="text-muted">Doing it yourself</span> vs <span className="text-accent dark:text-honey">with Waggle</span>
        </h3>
        <div className="mt-10 space-y-8">
          {OLD_NEW.map((r) => (
            <div key={r.topic} data-reveal>
              <div className="mb-3 text-xs font-semibold tracking-[0.2em] text-muted uppercase">{r.topic}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-line bg-surface-2/60 p-5">
                  <span className="rounded-full bg-line/70 px-2.5 py-1 text-[0.65rem] font-bold tracking-widest text-muted">WAS</span>
                  <p className="mt-3 text-lg text-muted line-through decoration-muted/40">{r.old}</p>
                </div>
                <div className="rounded-2xl border border-honey bg-surface p-5 shadow-card">
                  <span className="rounded-full bg-honey px-2.5 py-1 text-[0.65rem] font-bold tracking-widest text-hive">NOW</span>
                  <p className="mt-3 text-lg font-medium">{r.now}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div data-reveal className="rounded-3xl border border-line p-8">
            <h4 className="text-2xl font-semibold">Losing your evenings</h4>
            <p className="mt-3 text-soft">
              Answering the same five questions on your phone after close. Missing the one message that was a real order.
            </p>
          </div>
          <div data-reveal style={{ "--d": "120ms" } as React.CSSProperties} className="rounded-3xl bg-hive p-8 text-[#fff6e6] dark:border dark:border-edge">
            <h4 className="text-2xl font-semibold">
              Getting them back<span className="text-honey">.</span>
            </h4>
            <p className="mt-3 text-[#d9ccb0]">
              Waggle handles the questions, hides the spam and puts the buyers and complaints on top for you.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── 02 · The real problem ───────────────────────── */

const PROBLEMS = [
  { tag: "Time", quote: "I post when I remember. Which is never.", body: "Running the shop comes first. Socials get whatever is left, and there is never anything left." },
  { tag: "Speed", quote: "By the time I answer a DM, they’ve booked somewhere else.", body: "The question was easy. The answer was three hours late." },
  { tag: "Trust", quote: "I’m scared a bot will say something wrong to a customer.", body: "Your page is your reputation. One made-up price or a robotic reply to a complaint costs more than silence." },
];

function Problem() {
  return (
    <section className="relative px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Act n="02" label="The real problem" hint="Sound familiar?" />
        <h2 data-reveal className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
          It’s not that you need more followers.
        </h2>
        <p data-reveal className="mt-5 text-lg text-muted">Three things are actually in the way, and Waggle handles all three.</p>

        <div className="mt-14 space-y-6">
          {PROBLEMS.map((p, i) => (
            <article
              key={p.tag}
              data-reveal
              style={{ "--d": `${i * 80}ms` } as React.CSSProperties}
              className="relative rounded-[2rem] border border-line bg-surface p-8 shadow-card sm:p-12"
            >
              <Mark size={34} className="absolute top-8 right-8 opacity-80" />
              <div className="text-xs font-semibold tracking-[0.2em] text-accent uppercase dark:text-honey">{p.tag}</div>
              <h3 className="mt-4 max-w-2xl text-3xl leading-tight font-semibold tracking-[-0.02em] sm:text-4xl">“{p.quote}”</h3>
              <p className="mt-4 max-w-xl text-lg text-soft">{p.body}</p>
            </article>
          ))}
        </div>

        <p data-reveal className="mx-auto mt-20 max-w-3xl text-center text-3xl leading-snug font-semibold tracking-[-0.02em] sm:text-4xl">
          <span className="mark">Waggle fixes all three</span>, without you becoming a social media manager.
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────── 03 · How it works ───────────────────────── */

const FEATURES = [
  { t: "Plan the month in one sitting.", b: "Write once, add a photo, pick the pages and a time. Waggle publishes to every account you connect, from Instagram and TikTok to LinkedIn and Google, and tells you if a post didn’t go out." },
  { t: "Every comment and DM answered.", b: "Waggle sorts questions, buyers, complaints and spam. It answers from the business info you wrote and asks you when it doesn’t know." },
  { t: "Every buyer in one list.", b: "A booking, an order, a quote. Waggle pulls out the name, contact and request, saves it to Leads and emails you." },
  { t: "Set up in an afternoon.", b: "Connect your pages, tell it about your business, approve the first replies. Then let it go." },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-wash px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Act n="03" label="How it works" hint="Here’s the dance" flower />
        <div className="mt-5 grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <h2 data-reveal className="text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
              One loop. Post, answer, sell.
            </h2>
            <p data-reveal className="mt-6 max-w-xl text-lg leading-relaxed text-soft">
              Bees tell the hive where the flowers are with a figure-8 dance: the <strong className="text-ink">waggle</strong>. Your
              posts bring people in, Waggle answers them, and the ones ready to buy come straight to you.
            </p>
          </div>
          <div data-reveal>
            <LoopDiagram />
          </div>
        </div>

        <ol className="mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <li key={f.t} data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="border-t border-line pt-5">
              <span className="text-sm font-semibold text-accent dark:text-honey">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-soft">{f.b}</p>
            </li>
          ))}
        </ol>

        <p data-reveal className="mt-24 text-lg text-muted">
          Here’s what that looks like in practice: <strong className="text-ink">real replies, not generic AI output.</strong>
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {[
            ["Calendar", <CalendarPanel key="c" />],
            ["Inbox", <InboxPanel key="i" />],
            ["Leads", <LeadsPanel key="l" />],
          ].map(([label, panel], i) => (
            <div key={label as string} data-reveal style={{ "--d": `${i * 100}ms` } as React.CSSProperties}>
              <div className="mb-3 text-xs font-semibold tracking-[0.2em] text-muted uppercase">{label}</div>
              {panel}
            </div>
          ))}
        </div>

        <blockquote data-reveal className="mx-auto mt-24 max-w-3xl text-center text-3xl leading-snug font-medium tracking-[-0.02em] sm:text-4xl">
          “Write it once. Post it to every page. Every comment answered, and{" "}
          <span className="text-accent dark:text-honey">the real customers sent straight to you</span>.”
        </blockquote>
      </div>
    </section>
  );
}

/* ───────────────────────── 04 · Our rules ───────────────────────── */

const DOES = [
  "Answers questions only from the business info you wrote",
  "Tells you which questions it couldn’t answer yet",
  "Puts buyers and complaints on top, for you",
  "Hides spam and blocks reply tricks",
];

const NEVER = [
  "Make up a price, a time or a promise",
  "Answer a complaint on its own",
  "Send twice, or after Instagram’s 24-hour window",
  "Post anything you didn’t write and schedule yourself",
  "Keep going when you press Pause all replies",
];

const STEPS = [
  { t: "Connect your accounts.", b: "Instagram, Facebook, TikTok, LinkedIn and more, a minute each. Comments and DMs land in one inbox." },
  { t: "Tell it about your business.", b: "Hours, prices, menu, parking. Waggle answers only from what you write here." },
  { t: "Approve, then let it go.", b: "Check each reply with one key and an 8-second undo. When you trust it, let questions go out on their own." },
];

function Rules() {
  return (
    <section id="rules" className="bg-cream px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Act n="04" label="Why you can trust it" hint="Read the promises" flower />
        <h2 data-reveal className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
          Rules in the product, not settings.
        </h2>
        <p data-reveal className="mt-5 max-w-2xl text-lg text-soft">Your page is your reputation. So some things Waggle will simply never do.</p>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <div data-reveal className="rounded-[2rem] border border-line bg-surface p-8 shadow-card">
            <h3 className="text-xl font-semibold">What Waggle does</h3>
            <ul className="mt-6 space-y-4">
              {DOES.map((d) => (
                <li key={d} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-honey text-xs font-bold text-hive">✓</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal style={{ "--d": "120ms" } as React.CSSProperties} className="rounded-[2rem] bg-hive p-8 text-[#fff6e6] shadow-card dark:border dark:border-line">
            <h3 className="text-xl font-semibold">
              What Waggle will never do<span className="text-honey">.</span>
            </h3>
            <ul className="mt-6 space-y-4">
              {NEVER.map((d) => (
                <li key={d} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-[#5e513a] text-xs text-[#b9a988]">✕</span>
                  <span className="text-[#d9ccb0]">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div data-reveal className="mt-20 rounded-[2rem] border border-line bg-bg p-8 sm:p-12">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
            <div className="lg:w-1/3">
              <Mark size={120} bee />
              <h3 className="mt-6 text-3xl font-semibold tracking-[-0.02em]">Set up in an afternoon.</h3>
              <p className="mt-3 text-soft">No agency, no contract, no training course.</p>
            </div>
            <ol className="grid flex-1 gap-8 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <span className="grid size-10 place-items-center rounded-full bg-honey font-bold text-hive">{i + 1}</span>
                  <h4 className="mt-4 font-semibold">{s.t}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-soft">{s.b}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── 05 · What's next ───────────────────────── */

const ROADMAP = [
  { t: "Questions you keep getting", b: "Waggle suggests the topic your info doesn’t cover yet. You fill in the facts.", status: "In pilot" },
  { t: "Captions written from your business info", b: "A draft for your next post, in your voice.", status: "Coming" },
  { t: "A Monday summary", b: "What got asked, what got answered, which posts brought people in. One email.", status: "Coming" },
];

function WhatsNext() {
  return (
    <section id="whats-next" className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Act n="05" label="What’s next" hint="Coming soon" />
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h2 data-reveal className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
            Built next, with our pilot businesses.
          </h2>
          <p data-reveal className="max-w-sm text-lg text-soft">In the order they ask for it. Pilot customers get each one first.</p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {ROADMAP.map((r, i) => (
            <article
              key={r.t}
              data-reveal
              style={{ "--d": `${(i % 2) * 100}ms` } as React.CSSProperties}
              className={`flex flex-col rounded-[1.75rem] border p-7 transition hover:-translate-y-1 ${
                r.status === "In pilot" ? "border-honey bg-honey-soft" : "border-line bg-surface shadow-card"
              }`}
            >
              <span
                className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${
                  r.status === "In pilot" ? "bg-honey text-hive" : "border border-line text-muted"
                }`}
              >
                {r.status === "In pilot" ? "● In pilot" : "Coming"}
              </span>
              <h3 className="mt-5 text-xl font-semibold">{r.t}</h3>
              <p className="mt-2 text-soft">{r.b}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── 06 · Pricing ───────────────────────── */

const INCLUDED = [
  "Up to 5 connected accounts, posting to any of 14 platforms",
  "Every comment and DM sorted and answered",
  "Leads list, emailed to you as they come in",
  "Approve-first replies with 8-second undo",
  "Pause all replies, any time",
  "New features first, as a pilot business",
];

function Pricing() {
  return (
    <section id="pricing" className="bg-cream px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Act n="06" label="Pricing" hint="One plan, that’s it" flower />
        <h2 data-reveal className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
          One plan while we’re in pilot.
        </h2>
        <p data-reveal className="mt-5 text-lg text-soft">Posting, replies and leads across all your socials. Cancel any time.</p>

        <div data-reveal className="mt-14 grid overflow-hidden rounded-[2rem] border border-line bg-surface shadow-card lg:grid-cols-[1fr_1.2fr]">
          <div className="relative bg-honey p-8 text-hive sm:p-12">
            <span className="rounded-full bg-hive px-3 py-1 text-xs font-semibold text-honey">Pilot plan</span>
            {/* Placeholder pilot price until the real one is decided. Sized against running costs per shop:
                ~5 accounts on the posting API ($15–30 early, falling with volume), AI replies (~$5–10),
                email, hosting and card fees (~$5), which leaves room for support at ~70%+ margin. */}
            <div className="mt-8 flex flex-wrap items-baseline gap-x-2">
              <span className="text-5xl font-bold tracking-[-0.04em] whitespace-nowrap sm:text-6xl">$79</span>
              <span className="text-lg font-medium whitespace-nowrap">/ month</span>
            </div>
            <p className="mt-4 max-w-xs font-medium">14 days free, then $79 a month. You approve every reply until you trust it.</p>
            <a
              href={`${APP_URL}/signup`}
              className="mt-10 inline-flex h-16 w-full items-center justify-center gap-2 rounded-full bg-hive px-10 text-xl font-semibold text-[#fff6e6] transition hover:-translate-y-0.5 sm:w-auto"
            >
              Start 14-day free trial <span className="text-honey">→</span>
            </a>
            <Mark size={160} trail="#17140F" className="absolute right-6 bottom-6 opacity-20" />
          </div>
          <div className="p-8 sm:p-12">
            <h3 className="text-lg font-semibold">Everything in the pilot</h3>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {INCLUDED.map((x) => (
                <li key={x} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-honey-soft text-xs font-bold text-accent">✓</span>
                  <span className="text-soft">{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Closing CTA + footer ───────────────────────── */

/* ───────────────────────── 07 · FAQ ───────────────────────── */

// Each answer opens with a sentence that stands on its own, so search snippets and AI answers can quote it.
// The same text feeds the FAQPage structured data below; keep them one source.
const FAQS = [
  {
    q: "What is Waggle?",
    a: "Waggle is an AI social media manager for small businesses. It schedules your posts, answers comments and DMs from your business info in seconds, and tells you which customers are ready to buy.",
  },
  {
    q: "Which social media platforms does Waggle work with?",
    a: `Waggle posts to ${PLATFORM_NAMES.length} platforms from one calendar: ${PLATFORM_NAMES.slice(0, -1).join(", ")} and ${PLATFORM_NAMES.at(-1)}. Comments and DMs land in one inbox.`,
  },
  {
    q: "Does Waggle make up prices or answers?",
    a: "No. Waggle only answers from the business info you write. If a customer asks something that isn’t there, Waggle asks you instead of guessing.",
  },
  {
    q: "Do I have to let Waggle reply on its own?",
    a: "No. You approve every reply until you trust it, and every approved reply has an 8 second undo.",
  },
  {
    q: "How fast does Waggle reply to customers?",
    a: "About 6 seconds for regular questions like opening hours, prices or parking, day or night.",
  },
  {
    q: "Will Waggle spam my customers?",
    a: "No. Waggle never sends the same reply twice and never messages after Instagram’s 24-hour reply window closes.",
  },
  {
    q: "How does Waggle find customers who are ready to buy?",
    a: "Waggle spots the comments and DMs that sound like a booking or a purchase, puts them in one list with what each person asked for, and emails them to you.",
  },
  {
    q: "Who is Waggle for?",
    a: "Cafés, salons, shops and other local businesses that get customers through social media but don’t have time to post and reply all day.",
  },
  {
    q: "How much does Waggle cost?",
    a: "Waggle is $79 a month during the pilot, after a 14-day free trial, with up to 5 connected accounts and unlimited posts and replies. There’s one plan, no contract, and you can cancel any time.",
  },
  {
    q: "Can I try Waggle for free?",
    a: "Yes. Every plan starts with a 14-day free trial with everything included. After that it’s $79 a month, and you can cancel any time.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

function Faq() {
  return (
    <section id="faq" className="px-4 py-24 sm:py-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-6xl">
        <Act n="07" label="Questions" hint="Quick answers" />
        <h2 data-reveal className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
          Questions owners ask us.
        </h2>

        <div data-reveal className="mt-14 divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-semibold sm:text-xl [&::-webkit-details-marker]:hidden">
                <h3>{f.q}</h3>
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full border border-edge text-xl text-soft transition group-open:rotate-45 group-open:border-honey"
                >
                  +
                </span>
              </summary>
              <p className="max-w-3xl pb-6 text-lg leading-relaxed text-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section data-ground="dark" className="relative overflow-hidden bg-hive px-4 py-28 text-center text-[#fff6e6] sm:py-36 dark:border-y dark:border-line">
      <svg viewBox="-140 -110 280 220" className="pointer-events-none absolute top-1/2 left-1/2 w-[1200px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.12]" aria-hidden="true">
        <path d={FIGURE_8} fill="none" stroke="#F6B21B" strokeWidth="1.2" />
        <path d={FIGURE_8} transform="scale(.7)" fill="none" stroke="#F6B21B" strokeWidth="1.6" />
      </svg>
      <div className="relative mx-auto max-w-3xl">
        <h2 data-reveal className="text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-6xl">
          Ready to hand off your socials<span className="text-honey">?</span>
        </h2>
        <p data-reveal className="mx-auto mt-6 max-w-xl text-lg text-[#d9ccb0]">
          Connect your pages this afternoon. Nothing goes out until you’ve seen it.
        </p>
        <div data-reveal className="mt-10">
          {/* the guide bee lands on this button, perched like the bee on the logo */}
          <PrimaryCta data-bee-stop="Your turn" data-bee-lines="First reply wins the booking|Pilot shops get features first|Pilot shops shape what’s next" data-bee-perch="" />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { h: "Explore", links: [["How it works", "#how-it-works"], ["Our rules", "#rules"], ["What’s next", "#whats-next"], ["Pricing", "#pricing"]] },
    { h: "Start here", links: [["Start free", `${APP_URL}/signup`], ["Log in", `${APP_URL}/login`]] },
    { h: "Company", links: [["Privacy", "#"], ["Terms", "#"], ["Contact", "#"]] },
  ];
  return (
    <footer className="border-t border-line px-4 py-16">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-3">
            <Mark size={72} bee />
            <Wordmark className="text-3xl" />
          </div>
          <p className="mt-4 max-w-xs text-soft">AI that runs your socials. For cafés, salons and shops, on every major social platform.</p>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <h3 className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">{c.h}</h3>
            <ul className="mt-2">
              {c.links.map(([l, href]) => (
                <li key={l}>
                  <a href={href} className="inline-flex min-h-11 min-w-11 items-center text-soft transition hover:text-ink">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-6xl flex-col justify-between gap-2 border-t border-line pt-6 text-sm text-muted sm:flex-row">
        <span>© 2026 Waggle. All rights reserved.</span>
        <span>Your socials, handled.</span>
      </div>
    </footer>
  );
}
