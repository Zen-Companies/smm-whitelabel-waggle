import Link from "next/link";
import { Brand } from "@/components/app/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Dance } from "./dance";
import { FlightPath } from "./flight-path";
import { CalendarPreview, InboxPreview, LeadsPreview } from "./previews";

// The marketing landing page ("Landing E + G" on the Waggle screens v3 canvas): Paper rules
// with nothing extra. The wide bee dance under the headline, then the product (posting,
// replies, leads) with unboxed previews, set-up, what Waggle never does, what's next, one
// pilot plan. One flight path runs the page (FlightPath); the bee follows the scroll. Static:
// no data, no session.

const wrap = "mx-auto w-full max-w-[1184px] px-4 md:px-8";
const h2 = "text-3xl font-semibold tracking-[-0.03em] md:text-[36px] md:leading-[1.12]";
const lede = "text-ink-2 text-[17px]";
const hairlineList = "border-line flex list-none flex-col border-b";

export function LandingPage() {
  return (
    <div data-landing className="relative flex min-h-dvh flex-col text-base leading-[1.55]">
      <FlightPath />
      <header className="relative">
        <div className={cn(wrap, "flex min-h-[72px] items-center gap-2")}>
          <Link href="/" className="flex min-h-[72px] items-center" aria-label="Waggle, home">
            <Brand />
          </Link>
          <span className="ml-auto flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: "quiet" })}>
              Log in
            </Link>
            <Link href="/signup" className={buttonVariants({ variant: "primary" })}>
              Start free
            </Link>
          </span>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col">
        <section
          className={cn(wrap, "flex flex-col items-center gap-5 pt-16 pb-2 text-center md:pt-22")}
        >
          <h1 className="max-w-[880px] text-5xl font-semibold tracking-[-0.04em] md:text-7xl md:leading-[1.02]">
            Your socials, handled.
          </h1>
          <p className="text-ink-2 max-w-[640px] text-lg md:text-xl">
            Waggle posts for you, answers every comment and DM from your own business info, and
            brings you the customers who are ready to buy.
          </p>
          <Link
            href="/signup"
            className={cn(buttonVariants({ variant: "primary" }), "mt-2 min-h-12 px-6 text-base")}
          >
            Start free
          </Link>
          <span className="text-ink-3 text-sm">
            For cafés, salons and shops on Instagram and Facebook. You approve every reply until you
            trust it.
          </span>
        </section>

        <section aria-label="What Waggle found today" className={cn(wrap, "pt-6 pb-16 md:pb-22")}>
          <Dance />
        </section>

        <section className="border-line border-t">
          <div className={cn(wrap, "flex flex-col gap-16 py-16 md:gap-22 md:py-22")}>
            <Feature
              title="Plan the month in one sitting."
              text="Write once, add a photo, pick the pages and a time. Waggle publishes to Instagram and Facebook and tells you if a post didn't go out."
            >
              <CalendarPreview />
            </Feature>
            <Feature
              title="Every comment and DM answered. From your facts, never made up."
              text="Waggle sorts questions, buyers, complaints and spam. It answers questions from the business info you wrote, asks you when it doesn't know, and hands complaints straight to you."
              flip
            >
              <InboxPreview />
            </Feature>
            <Feature
              title="Every buyer in one list, with what they asked for."
              text="A booking, an order, a quote. Waggle pulls out the name, contact and request, saves it to Leads and emails you so nobody slips through."
            >
              <LeadsPreview />
            </Feature>
          </div>
        </section>

        <Split id="how" title="Set up in an afternoon.">
          <ol className={hairlineList}>
            <Row>
              <b className="font-semibold">Connect your pages.</b>{" "}
              <span className="text-ink-2">
                Instagram and Facebook, a minute each. Posts go out from here; every comment and DM
                lands in one inbox.
              </span>
            </Row>
            <Row>
              <b className="font-semibold">Tell it about your business.</b>{" "}
              <span className="text-ink-2">
                Hours, prices, menu, parking. Waggle answers only from what you write here, and
                tells you which questions it couldn&rsquo;t answer yet.
              </span>
            </Row>
            <Row>
              <b className="font-semibold">Approve, then let it go.</b>{" "}
              <span className="text-ink-2">
                Check each reply with one key and an 8-second undo. When you trust it, let questions
                go out on their own.
              </span>
            </Row>
          </ol>
        </Split>

        <Split
          id="never"
          title="What Waggle will never do"
          lede="Your page is your reputation. These are rules in the product, not settings."
        >
          <ul className={hairlineList}>
            <Row>
              Make up a price, a time or a promise. If it isn&rsquo;t in your info, it asks you.
            </Row>
            <Row>Answer a complaint on its own. Those always come to you.</Row>
            <Row>Send twice, or after Instagram&rsquo;s 24-hour window.</Row>
            <Row>Post anything you didn&rsquo;t write and schedule yourself.</Row>
            <Row>Keep going when you press Pause all replies.</Row>
          </ul>
        </Split>

        <Split
          id="next"
          title="Next, with our pilot businesses"
          lede="In the order they ask for it. Pilot customers get each one first."
        >
          <ul className={hairlineList}>
            <Soon title="Captions written from your business info." status="Coming">
              A draft for your next post, in your voice.
            </Soon>
            <Soon title="A Monday summary." status="Coming">
              What got asked, what got answered, which posts brought people in. One email.
            </Soon>
            <Soon title="Questions you keep getting." status="In pilot">
              Waggle suggests the topic your info doesn&rsquo;t cover yet. You fill in the facts.
            </Soon>
            <Soon title="More places to post." status="Coming">
              TikTok, Threads and LinkedIn from the same calendar; WhatsApp in the same inbox.
            </Soon>
          </ul>
        </Split>

        <section id="pricing" className="border-line border-t">
          <div
            className={cn(wrap, "grid items-center gap-10 py-16 md:grid-cols-2 md:gap-16 md:py-22")}
          >
            <div className="flex flex-col gap-2.5">
              <h2 className={h2}>One plan while we&rsquo;re in pilot.</h2>
              <p className={lede}>
                Posting, replies and leads on Instagram and Facebook. Cancel any time.
              </p>
            </div>
            <div className="border-line flex flex-col gap-3.5 border-t border-b border-t-[var(--ink)] py-6">
              <span className="text-[44px] font-semibold tracking-[-0.03em]">
                [YOUR PRICE]
                <span className="text-ink-3 text-base font-normal"> / month</span>
              </span>
              <Link
                href="/signup"
                data-flight="end"
                className={cn(
                  buttonVariants({ variant: "primary" }),
                  "min-h-12 self-start px-6 text-base",
                )}
              >
                Start free
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-line relative border-t">
        <div className={cn(wrap, "text-ink-3 flex flex-wrap items-center gap-4 py-8 text-sm")}>
          <Brand />
          <span>AI that runs your socials.</span>
          <span className="ml-auto flex gap-5">
            <a href="#" className="text-ink-3 hover:text-ink">
              Privacy
            </a>
            <a href="#" className="text-ink-3 hover:text-ink">
              Terms
            </a>
            <a href="#" className="text-ink-3 hover:text-ink">
              Contact
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** A feature: words on one side, the unboxed preview on the other. The flight path runs the gutter between. */
function Feature({
  title,
  text,
  flip,
  children,
}: {
  title: string;
  text: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-flight="gutter"
      className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-16"
    >
      <div className={cn("flex min-w-0 flex-col gap-3", flip && "md:order-last")}>
        <h2 className={h2}>{title}</h2>
        <p className={lede}>{text}</p>
      </div>
      {children}
    </div>
  );
}

/** A heading on the left, a hairline list on the right. The flight path runs the gutter between. */
function Split({
  id,
  title,
  lede: ledeText,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-line border-t">
      <div
        data-flight="gutter"
        className={cn(wrap, "grid gap-10 py-16 md:grid-cols-2 md:gap-16 md:py-22")}
      >
        <div className="flex flex-col gap-2.5">
          <h2 className={h2}>{title}</h2>
          {ledeText && <p className={lede}>{ledeText}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="border-line border-t py-4">{children}</li>;
}

function Soon({
  title,
  status,
  children,
}: {
  title: string;
  status: "Coming" | "In pilot";
  children: React.ReactNode;
}) {
  return (
    <li className="border-line flex items-baseline gap-4 border-t py-4">
      <span className="flex-1">
        <b className="font-semibold">{title}</b> <span className="text-ink-2">{children}</span>
      </span>
      <span className="text-ink-3 text-[13px] whitespace-nowrap">{status}</span>
    </li>
  );
}
