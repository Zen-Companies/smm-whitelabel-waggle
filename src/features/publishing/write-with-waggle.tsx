"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { writeCaptionAction, type CaptionState } from "./actions";
import { CAPTION_ABOUT_MAX, CAPTION_TONES, type CaptionMode, type CaptionTone } from "./caption";

// Write with Waggle (Posts Round 5, board section 1, approved 27 Nov): in New post, "What's this
// post about?", a tone, ✦ Write it; the suggestion sits in a honey card with Use this / Shorter /
// Another one / + Hashtags. "Improve" works on text the owner already wrote. Nothing changes the
// post until Use this. Feedback stays here (no toasts). Inside the composer's form: no field here
// has a name, every button is type="button", and Enter never sends the post.

export function WriteWithWaggle({
  text,
  maxLength,
  onUse,
}: {
  /** The post's text now (Improve works on it). */
  text: string;
  /** The shortest limit among the picked platforms. */
  maxLength: number;
  onUse: (caption: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState("");
  const [tone, setTone] = useState<CaptionTone>("friendly");
  const [result, setResult] = useState<(CaptionState & { ok: true }) | null>(null);
  const [error, setError] = useState<{ text: string; capped: boolean } | null>(null);
  const [running, setRunning] = useState<CaptionMode | null>(null);
  const [, startTransition] = useTransition();
  const hasText = text.trim().length > 0;

  const run = (mode: CaptionMode) => {
    if (running) return;
    if ((mode === "write" || mode === "another") && !about.trim()) {
      setError({ text: "Say what the post is about first.", capped: false });
      return;
    }
    setOpen(true);
    setError(null);
    setRunning(mode);
    startTransition(async () => {
      const current = mode === "improve" ? text : (result?.caption ?? "");
      const r = await writeCaptionAction({
        mode,
        tone,
        about,
        current,
        maxLength: Math.max(50, Math.min(maxLength, 2200)),
      }).catch((): CaptionState => ({
        ok: false,
        error: "Waggle couldn't write one just now. Try again.",
      }));
      setRunning(null);
      if (r.ok) {
        setResult(r);
      } else {
        setError({ text: r.error, capped: !!r.capped });
      }
    });
  };

  const busy = running !== null;
  const label = (mode: CaptionMode, idle: string) => (running === mode ? "Writing…" : idle);

  return (
    <section aria-label="Write with Waggle" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="border-honey-border bg-honey-tint text-ink hover:bg-subtle inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold"
        >
          <span aria-hidden className="text-honey-text">
            ✦
          </span>
          Write with Waggle
        </button>
        {hasText && (
          <button
            type="button"
            onClick={() => run("improve")}
            disabled={busy}
            className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold disabled:opacity-60"
          >
            <span aria-hidden className="text-honey-text">
              ✦
            </span>
            {label("improve", "Improve")}
          </button>
        )}
      </div>

      {open && (
        <div className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="caption-about" className="text-sm font-medium">
              What&apos;s this post about?
            </label>
            <input
              id="caption-about"
              value={about}
              maxLength={CAPTION_ABOUT_MAX}
              onChange={(e) => setAbout(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run("write");
                }
              }}
              placeholder="Black Friday, two loaves for one"
              className="field"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tone">
            {CAPTION_TONES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={tone === t.key}
                onClick={() => setTone(t.key)}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold",
                  tone === t.key
                    ? "border-honey bg-honey-tint text-ink border-[1.5px]"
                    : "border-line-strong bg-surface text-ink-2 hover:bg-subtle",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <Button type="button" variant="primary" onClick={() => run("write")} disabled={busy}>
              <span aria-hidden>✦</span> {label("write", "Write it")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className={error.capped ? "text-honey-text text-sm" : "text-danger text-sm"}
        >
          {error.text}
        </p>
      )}

      {result && (
        <div
          role="status"
          aria-live="polite"
          className="border-honey-border bg-honey-tint flex flex-col gap-2.5 rounded-2xl border p-3.5"
        >
          <p className="text-[15px] whitespace-pre-wrap">{result.caption}</p>
          <p className="text-ink-3 text-xs">{result.source}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => {
                onUse(result.caption);
                setResult(null);
                setOpen(false);
              }}
            >
              Use this
            </Button>
            <Button type="button" disabled={busy} onClick={() => run("shorter")}>
              {label("shorter", "Shorter")}
            </Button>
            <Button
              type="button"
              disabled={busy || !about.trim()}
              title={!about.trim() ? "Say what the post is about to get another one" : undefined}
              onClick={() => run("another")}
            >
              {label("another", "Another one")}
            </Button>
            <Button type="button" disabled={busy} onClick={() => run("hashtags")}>
              {label("hashtags", "+ Hashtags")}
            </Button>
          </div>
          <p className="text-ink-3 text-xs">
            Each try counts toward this month&apos;s AI allowance. Use this puts it in your post,
            where you can still change it; each app&apos;s limit is checked as usual.
          </p>
        </div>
      )}
    </section>
  );
}
