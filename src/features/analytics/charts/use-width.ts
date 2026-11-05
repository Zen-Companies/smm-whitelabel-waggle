"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The element's width in CSS pixels, so a chart draws at its real size (text never stretches) and
 * fits a phone. `fallback` is used for the server render and the first paint.
 */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
