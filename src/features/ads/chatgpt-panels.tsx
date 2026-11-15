"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  connectChatGptAdsAction,
  createChatGptAdAction,
  setChatGptBudgetAction,
  type AdsState,
} from "./actions";
import { money } from "./boost";
import {
  CHATGPT_BODY_MAX,
  CHATGPT_COUNTRIES,
  CHATGPT_IMAGE_TYPES,
  CHATGPT_TITLE_MAX,
  linkHost,
} from "./chatgpt";

const fieldError = (state: AdsState, field: string) =>
  state.field === field && state.error ? (
    <p role="alert" className="text-danger text-sm font-normal">
      {state.error}
    </p>
  ) : null;

/** Connect ChatGPT ads (T79c): paste the key from ChatGPT Ads Manager. Owners and admins only. */
export function ChatGptConnectForm() {
  const [state, action, pending] = useActionState<AdsState, FormData>(connectChatGptAdsAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your ChatGPT Ads key
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="Paste it from ChatGPT Ads Manager → Settings"
          className="field font-normal"
        />
        {fieldError(state, "apiKey")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Connecting…" : "Connect ChatGPT ads"}
        </Button>
        <span className="meta">One key per ad account. Open to US businesses only.</span>
      </div>
      {state.error && !state.field && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * New ad (board "Ads · ChatGPT"): title, one line, a photo, the link, where it shows, a daily
 * budget, confirmed in place, with a live preview of the chat card.
 */
export function ChatGptAdForm({ currency, account }: { currency: string; account: string }) {
  const [state, action, pending] = useActionState<AdsState, FormData>(createChatGptAdAction, {});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [daily, setDaily] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const perDay = Number(daily);
  const ready = title.trim().length >= 3 && body.trim() && link.trim() && photo && perDay >= 1;

  if (state.savedAt && !state.error) {
    return (
      <p role="status" className="card p-5">
        Sent to ChatGPT. It runs once OpenAI accepts it, until you pause it.
      </p>
    );
  }
  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="chatgpt-new">
      <div>
        <h2 id="chatgpt-new" className="section-title">
          New ChatGPT ad
        </h2>
        <p className="meta">
          {account} ({currency}). A small card that shows inside ChatGPT answers.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-4" onChange={() => setSure(false)}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Title{" "}
          <span className="meta font-normal">
            {title.length} / {CHATGPT_TITLE_MAX}
          </span>
          <input
            name="title"
            maxLength={CHATGPT_TITLE_MAX}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Open house this Saturday"
            className="field font-normal"
          />
          {fieldError(state, "title")}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          One line about it{" "}
          <span className="meta font-normal">
            {body.length} / {CHATGPT_BODY_MAX}
          </span>
          <input
            name="body"
            maxLength={CHATGPT_BODY_MAX}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="3 bed near the beach. Tour it 1 to 3 PM."
            className="field font-normal"
          />
          {fieldError(state, "body")}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Photo
          <input
            name="photo"
            type="file"
            required
            accept={CHATGPT_IMAGE_TYPES.join(",")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPhoto((old) => {
                if (old) URL.revokeObjectURL(old);
                return file ? URL.createObjectURL(file) : null;
              });
            }}
            className="text-sm font-normal"
          />
          <span className="meta font-normal">A still photo, JPG, PNG or WebP, up to 5 MB.</span>
          {fieldError(state, "photo")}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Where it sends people
          <input
            name="linkUrl"
            type="url"
            required
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://yourbusiness.com/offer"
            className="field font-normal"
          />
          {fieldError(state, "linkUrl")}
        </label>
        <p className="meta">Goal: visits to your site. ChatGPT finds the people likely to click.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Who sees it
            <select name="country" className="field w-52 font-normal" defaultValue="US">
              {CHATGPT_COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Per day ({currency})
            <input
              name="daily"
              type="number"
              min={1}
              step={1}
              required
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
              placeholder="20"
              className="field w-32 font-normal"
            />
          </label>
        </div>
        {fieldError(state, "country")}
        {fieldError(state, "daily")}
        <p className="text-sm">
          {perDay >= 1 ? (
            <>
              Up to <b>{money(perDay, currency)}</b> a day, charged by OpenAI to your ad account.
              Waggle adds nothing on top.{" "}
            </>
          ) : null}
          Runs until you pause it.
        </p>
        {sure ? (
          <div className="border-honey-border bg-honey-tint flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
            <b className="flex-[1_1_220px] font-semibold">
              Send this ad to ChatGPT? Up to {money(perDay, currency)} a day will be charged until
              you pause it.
            </b>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Sending…" : "Send to ChatGPT"}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setSure(false)}>
              Not yet
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="primary"
            className="self-start"
            disabled={!ready}
            onClick={() => setSure(true)}
          >
            Review and send
          </Button>
        )}
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </form>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Preview</h3>
        <div className="bg-subtle flex flex-col gap-2 rounded-2xl p-3">
          <p className="meta">Someone asks ChatGPT something your ad fits…</p>
          <div className="border-line bg-surface flex gap-3 rounded-xl border p-2.5">
            {photo ? (
              // A local preview of the picked file; nothing leaves the browser.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-[72px] flex-none rounded-lg object-cover" />
            ) : (
              <span className="bg-honey-tint size-[72px] flex-none rounded-lg" aria-hidden />
            )}
            <span className="min-w-0 text-sm">
              <span className="text-ink-3 block text-[11px]">
                Sponsored{linkHost(link) ? ` · ${linkHost(link)}` : ""}
              </span>
              <b className="block font-semibold">{title || "Your title"}</b>
              <span className="text-ink-2">{body || "Your one line about it."}</span>
            </span>
          </div>
        </div>
        <p className="meta">Roughly how it looks. ChatGPT decides where it shows.</p>
      </div>
    </section>
  );
}

/** Change a ChatGPT ad's daily budget, in place on its row. */
export function ChatGptBudgetForm({ id, current }: { id: string; current: number | null }) {
  const [state, action, pending] = useActionState<AdsState, FormData>(setChatGptBudgetAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
        Change daily budget
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`budget-${id}`}>
        New daily budget
      </label>
      <input
        id={`budget-${id}`}
        name="daily"
        type="number"
        min={1}
        step={1}
        required
        defaultValue={current ?? undefined}
        className="field w-24"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state.savedAt && !state.error && (
        <span role="status" className="text-success text-sm">
          Saved.
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}
