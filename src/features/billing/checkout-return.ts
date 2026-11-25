// Pure: where Stripe sends someone who backs out of Checkout without a word (the site's plan
// card, 25 Nov). After sign-up with a plan, backing out of Checkout lands in setup on Free with no
// error and no pop-up: the page the checkout started from, without the pop-up's parameters.

const DROP = ["upgrade", "welcome", "checkout", "session_id", "start"];

/** A path on this site, without the pop-up's and the link's parameters; null for anything else. */
export function quietCancelPath(back: unknown): string | null {
  if (typeof back !== "string" || !/^\/(?![/\\])[^\s]{0,400}$/.test(back)) return null;
  const url = new URL(back, "http://waggle.local");
  if (url.origin !== "http://waggle.local") return null;
  for (const k of DROP) url.searchParams.delete(k);
  const q = url.searchParams.toString();
  return q ? `${url.pathname}?${q}` : url.pathname;
}
