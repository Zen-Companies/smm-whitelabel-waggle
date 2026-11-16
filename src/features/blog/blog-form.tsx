"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { createArticleAction, type ArticleState } from "./actions";
import { canSchedule, hasSeo, type ArticleMode, type BlogPlatform } from "./blog";

/** New blog post (design "Posts · Blog"): title, text, cover, tags, search preview, when. */
export function BlogForm({
  articleKey,
  accountId,
  blogId,
  platform,
  siteName,
}: {
  articleKey: string;
  accountId: string;
  blogId: string;
  platform: BlogPlatform;
  siteName: string;
}) {
  const [state, action, pending] = useActionState<ArticleState, FormData>(createArticleAction, {});
  const values = state.values ?? {};
  const [mode, setMode] = useState<ArticleMode>((values.mode as ArticleMode) || "now");
  if (state.done) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-success text-sm font-medium">{state.done}</p>
        {state.url && (
          <a href={state.url} target="_blank" rel="noreferrer" className="action-link with-arrow">
            Open the post
          </a>
        )}
        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
          Write another
        </Button>
      </div>
    );
  }
  const err = (f: string) =>
    state.field === f && state.error ? (
      <span role="alert" className="text-danger text-sm">
        {state.error}
      </span>
    ) : null;
  const modes: [ArticleMode, string][] = [
    ["now", "Publish now"],
    ...(canSchedule(platform) ? ([["schedule", "Schedule"]] as [ArticleMode, string][]) : []),
    ["draft", "Save as draft"],
  ];
  return (
    <form
      action={(fd) => {
        // The schedule is in the owner's own time, as their device shows it.
        fd.set("tzOffset", String(new Date().getTimezoneOffset()));
        return action(fd);
      }}
      className="card flex flex-col gap-4 p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">New blog post</h2>
        <span className="meta">{siteName}</span>
      </div>
      <input type="hidden" name="articleKey" value={state.key ?? articleKey} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="blogId" value={blogId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Title
        <input name="title" maxLength={255} defaultValue={values.title ?? ""} className="field" />
        {err("title")}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Text
        <textarea
          name="text"
          rows={12}
          defaultValue={values.text ?? ""}
          className="field min-h-48 py-2"
          placeholder="Leave an empty line between paragraphs."
        />
        {err("text")}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Cover image
          <input
            name="cover"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="field py-2"
          />
          {err("cover")}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Tags
          <input
            name="tags"
            defaultValue={values.tags ?? ""}
            placeholder="ube, desserts"
            className="field"
          />
          <span className="meta">Separate with commas.</span>
          {err("tags")}
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Summary (optional)
        <input
          name="excerpt"
          maxLength={300}
          defaultValue={values.excerpt ?? ""}
          className="field"
        />
        <span className="meta">Shown in your blog&apos;s list of posts.</span>
        {err("excerpt")}
      </label>
      {hasSeo(platform) && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Search preview</legend>
          <p className="meta">What Google shows. Optional.</p>
          <input
            name="seoTitle"
            maxLength={70}
            defaultValue={values.seoTitle ?? ""}
            placeholder="Search title"
            className="field"
            aria-label="Search title"
          />
          {err("seoTitle")}
          <input
            name="seoDescription"
            maxLength={160}
            defaultValue={values.seoDescription ?? ""}
            placeholder="Search description"
            className="field"
            aria-label="Search description"
          />
          {err("seoDescription")}
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">When</legend>
        <div className="flex flex-wrap gap-2">
          {modes.map(([m, label]) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center rounded-full border px-3.5 py-2 text-sm ${mode === m ? "border-ink bg-ink text-surface" : "border-line-strong"}`}
            >
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {mode === "schedule" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Day and time
            <input
              name="when"
              type="datetime-local"
              defaultValue={values.when ?? ""}
              className="field w-64"
            />
          </label>
        )}
        {err("when")}
        {!canSchedule(platform) && (
          <p className="meta">Webflow can&apos;t schedule posts: publish now or save a draft.</p>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? "Sending…"
            : mode === "draft"
              ? "Save as draft"
              : mode === "schedule"
                ? "Schedule"
                : "Publish now"}
        </Button>
        {state.error && !state.field && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
