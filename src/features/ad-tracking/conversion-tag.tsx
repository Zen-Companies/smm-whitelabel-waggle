"use client";

import { useEffect } from "react";
import {
  cookieOptsOut,
  LIVE_HOSTS,
  META_PIXEL_ID,
  TIKTOK_ADS_PIXEL_ID,
  TIKTOK_PIXEL_ID,
  CUSTOM_EVENTS,
  type ConversionEvent,
} from "./tags";

const TEST_KEY = "waggle_pixels";
const SENT_PREFIX = "waggle_conv_";

export interface ConversionTagProps {
  event: ConversionEvent;
  /** From conversionEventId: the same signup or checkout always has the same id. */
  eventId: string;
  /** Hashed on the server (hash.ts); never a plain email. */
  em?: string;
  externalId: string;
  /** StartTrial and Subscribe: the plan's monthly price in US dollars. */
  valueUsd?: number;
  /** StartTrial and Subscribe: the plan id. */
  plan?: string;
  /** ConnectAccount: the platform connected. */
  platform?: string;
}

function optedOut(): boolean {
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  if (gpc === true) return true;
  try {
    if (cookieOptsOut(document.cookie)) return true;
    return window.localStorage.getItem("waggle_no_ads") === "1";
  } catch {
    return false;
  }
}

// Live host only; a preview or local run after ?pixels=on in that tab (?pixels=off undoes it).
function enabledHere(): boolean {
  if (optedOut()) return false;
  try {
    const flag = new URLSearchParams(window.location.search).get("pixels");
    if (flag === "on") window.sessionStorage.setItem(TEST_KEY, "on");
    if (flag === "off") window.sessionStorage.removeItem(TEST_KEY);
    return (
      LIVE_HOSTS.includes(window.location.hostname) ||
      window.sessionStorage.getItem(TEST_KEY) === "on"
    );
  } catch {
    return false;
  }
}

// Once per browser per event id, on top of the platforms' own de-duplication.
function alreadySent(eventId: string): boolean {
  try {
    if (window.localStorage.getItem(SENT_PREFIX + eventId)) return true;
    window.localStorage.setItem(SENT_PREFIX + eventId, "1");
  } catch {
    // storage blocked: send it; the platforms drop repeats of the same event id
  }
  return false;
}

function inject(id: string, code: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.text = code;
  document.head.appendChild(s);
}

/**
 * Sends one conversion to Meta and TikTok, then nothing else: no page views, no automatic
 * events (Meta's autoConfig off), so the tags never see the rest of the app.
 * Each platform's base code as issued, in its own try: a blocked tag never breaks the page.
 */
export function ConversionTag({
  event,
  eventId,
  em,
  externalId,
  valueUsd,
  plan,
  platform,
}: ConversionTagProps) {
  useEffect(() => {
    if (!enabledHere() || alreadySent(eventId)) return;
    const match = JSON.stringify({ ...(em ? { em } : {}), external_id: externalId });
    const params =
      event === "StartTrial" || event === "Subscribe"
        ? {
            value: valueUsd ?? 0,
            currency: "USD",
            content_name: plan ?? "plan",
            content_type: "product",
          }
        : event === "ConnectAccount"
          ? { content_name: platform ?? "account", status: "connected" }
          : { content_name: "account", status: "registered" };
    const ttMatch = JSON.stringify({ ...(em ? { email: em } : {}), external_id: externalId });
    try {
      inject(
        "waggle-meta-tag",
        `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
          `fbq('set','autoConfig',false,'${META_PIXEL_ID}');fbq('init','${META_PIXEL_ID}',${match});`,
      );
      const w = window as Window & { fbq?: (...a: unknown[]) => void };
      w.fbq?.(CUSTOM_EVENTS.includes(event) ? "trackCustom" : "track", event, params, {
        eventID: eventId,
      });
    } catch {}
    try {
      inject(
        "waggle-tiktok-tag",
        `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=i+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load('${TIKTOK_PIXEL_ID}');ttq.load('${TIKTOK_ADS_PIXEL_ID}');}(window,document,'ttq');` +
          `ttq.identify(${ttMatch});`,
      );
      const w = window as Window & {
        ttq?: { track: (e: string, p?: object, o?: object) => void };
      };
      w.ttq?.track(event, params, { event_id: eventId });
    } catch {}
  }, [event, eventId, em, externalId, valueUsd, plan, platform]);
  return null;
}
