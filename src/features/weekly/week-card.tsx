import Link from "next/link";
import { ActionLink } from "@/components/app/action-link";
import { PlatformMark } from "@/components/app/platform-mark";
import { buttonVariants } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import { getServiceClient } from "@/lib/supabase/service";
import { viewerTimeZone } from "@/lib/time/viewer-zone";
import { checkNowAction, weeklyProgressAction, type CheckNowView } from "./actions";
import { CheckNow } from "./check-now";
import {
  answeredSplit,
  checkedLine,
  checkingLabel,
  couldntReadLine,
  firstRunLine,
  foundLine,
  quietLine,
  readingLine,
  usedTodayLine,
  vsLastWeek,
  waitingLine,
  weekRange,
} from "./copy";
import { loadWeekCard } from "./data";

// Today → "Your week" (board "Your week", approved 26 Nov; replaces "This week"). The latest
// check-up's stored numbers (no AI on the page), Check now, what people wanted, and the questions
// Waggle's answers don't cover (live, the same as Teach Waggle's). Phone: the board's 390px card.

function Tile({
  n,
  label,
  short,
  sub,
  tone,
  subTone,
}: {
  n: number;
  label: string;
  short?: string;
  sub: string | null;
  tone: string;
  subTone: string;
}) {
  return (
    <div className={`rounded-[14px] p-3 ${tone}`}>
      <div className="font-display text-[22px] leading-tight font-bold tabular-nums md:text-[26px]">
        {n}
      </div>
      <div className="text-ink-2 text-[12.5px]">
        {short ? (
          <>
            <span className="md:hidden">{short}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </div>
      {sub && <div className={`mt-0.5 hidden text-[11.5px] md:block ${subTone}`}>{sub}</div>}
    </div>
  );
}

export async function WeekCard({
  tenantId,
  canCheck,
  gaps,
}: {
  tenantId: string;
  canCheck: boolean;
  gaps: { text: string; times: number }[];
}) {
  const now = new Date();
  const [data, zone] = await Promise.all([
    loadWeekCard(getServiceClient(), tenantId, now),
    viewerTimeZone(),
  ]);
  const latest = data.latest;
  const s = latest?.summary ?? null;

  const initial: CheckNowView = data.active
    ? {
        kind: "checking",
        runId: data.active.runId,
        label: data.active.total ? checkingLabel(data.active.done, data.active.total) : "Checking…",
        note: readingLine(data.active.reading),
      }
    : !data.checkNow.open && data.checkNow.lastAt
      ? { kind: "used", line: usedTodayLine(new Date(data.checkNow.lastAt), zone) }
      : { kind: "idle" };

  const failed = s
    ? s.accounts.filter((a) => a.state === "failed").map((a) => platformLabel(a.platform))
    : [];
  const most = s ? Math.max(1, ...s.accounts.map((a) => a.count)) : 1;
  const answered = s ? s.answeredByWaggle + s.answeredByYou : 0;

  return (
    <section className="card flex flex-col gap-4 p-4 md:p-6" aria-labelledby="your-week-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <h2 id="your-week-title" className="section-title">
            Your week
          </h2>
          {latest && s ? (
            <p className="meta mt-0.5">
              <span className="hidden md:inline">
                {weekRange(new Date(latest.from), new Date(latest.to), zone)}
              </span>
              <span className="md:hidden">
                {weekRange(new Date(latest.from), new Date(latest.to), zone, "short")}
              </span>{" "}
              · {checkedLine(new Date(latest.finishedAt), s.accounts.length, zone)}
            </p>
          ) : (
            <p className="meta mt-0.5">{firstRunLine(new Date(data.nextRun), zone)}</p>
          )}
        </div>
        <CheckNow
          initial={initial}
          canCheck={canCheck}
          check={checkNowAction}
          progress={weeklyProgressAction}
        />
      </div>

      {failed.length > 0 && (
        <p className="text-ink-2 text-sm">
          <span className="text-honey-text" aria-hidden>
            ◌{" "}
          </span>
          {couldntReadLine(failed)}{" "}
          <Link href="/settings/accounts" className="link-inline">
            Reconnect
          </Link>{" "}
          · the rest is up to date.
        </p>
      )}

      {s && s.cameIn === 0 && <p className="text-ink-2 text-[15px]">{quietLine(0)}</p>}

      {s && s.cameIn > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
            <Tile
              n={s.cameIn}
              label="came in"
              sub={vsLastWeek(s.cameIn, s.previousCameIn)}
              tone="bg-subtle"
              subTone="text-success"
            />
            <Tile
              n={answered}
              label="answered"
              sub={answeredSplit(s.answeredByWaggle, s.answeredByYou)}
              tone="bg-subtle"
              subTone="text-ink-3"
            />
            <Tile
              n={s.waiting}
              label="still waiting"
              sub={waitingLine(s.closingToday)}
              tone="bg-honey-tint"
              subTone="text-honey-text"
            />
            <Tile
              n={s.found}
              label="found that Waggle missed"
              short="Waggle missed"
              sub={foundLine(s.found, s.tooOld)}
              tone="bg-danger-soft"
              subTone="text-danger"
            />
          </div>

          {s.accounts.length > 0 && (
            <div className="hidden md:block">
              <h3 className="mb-2 text-[13px] font-semibold">By account</h3>
              <ul className="flex flex-col gap-1.5 text-[13.5px]">
                {s.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <PlatformMark platform={a.platform} size={22} />
                    <span className="min-w-0 flex-1 truncate">{platformLabel(a.platform)}</span>
                    <span
                      className="bg-subtle h-2 w-[180px] overflow-hidden rounded-full"
                      aria-hidden
                    >
                      <span
                        className="bg-honey block h-full"
                        style={{ width: `${Math.round((a.count / most) * 100)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right tabular-nums">{a.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.topics.length > 0 && (
            <div>
              <h3 className="mb-2 hidden text-[13px] font-semibold md:block">What people wanted</h3>
              <div className="hidden flex-wrap gap-2 md:flex">
                {s.topics.map((t) => (
                  <span
                    key={t.topic}
                    className="bg-subtle text-ink-2 rounded-full px-2.5 py-1 text-xs font-semibold"
                  >
                    {t.label} · {t.count}
                  </span>
                ))}
              </div>
              <p className="text-[13px] md:hidden">
                <b>Top asks:</b>{" "}
                {s.topics
                  .slice(0, 3)
                  .map((t) => t.label)
                  .join(" · ")}
              </p>
            </div>
          )}
        </>
      )}

      {gaps.length > 0 && (
        <div className="border-honey-border bg-honey-tint flex flex-col gap-2 rounded-[14px] border p-3 md:p-3.5">
          <b className="hidden text-sm md:block">
            {`${gaps.length} ${gaps.length === 1 ? "question" : "questions"} your answers don't cover`}
          </b>
          <ul className="hidden flex-col gap-2 md:flex">
            {gaps.map((g) => (
              <li key={g.text} className="bg-surface rounded-[10px] px-2.5 py-2 text-[13.5px]">
                &ldquo;{g.text}&rdquo;
                {g.times > 1 && <span className="text-ink-3"> · asked {g.times} times</span>}
              </li>
            ))}
          </ul>
          <div className="hidden flex-wrap items-center gap-2.5 md:flex">
            <Link href="/teach#questions" className={buttonVariants({ variant: "primary" })}>
              Write the answers
            </Link>
            <span className="text-ink-3 text-[12.5px]">
              Write it once and Waggle can answer it next time.
            </span>
          </div>
          <p className="text-[13px] md:hidden">
            {`${gaps.length} ${gaps.length === 1 ? "question" : "questions"} your answers don't cover`}{" "}
            ·{" "}
            <Link href="/teach#questions" className="link-inline">
              Write the answers
            </Link>
          </p>
        </div>
      )}

      <ActionLink href="/insights/work?period=7" className="self-start text-[13.5px]">
        See your whole week
      </ActionLink>
    </section>
  );
}
