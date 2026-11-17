// Light, dark or match device (design.md §1 rule 9), remembered per device.

export const THEME_KEY = "waggle-theme";
export type ThemePref = "light" | "dark" | "system";

export function parseThemePref(value: string | null): ThemePref {
  return value === "dark" || value === "system" ? value : "light";
}

export function resolveTheme(pref: ThemePref, deviceDark: boolean): "light" | "dark" {
  return pref === "system" ? (deviceDark ? "dark" : "light") : pref;
}

/**
 * Runs in <head> before paint so dark mode never flashes white. Plain ES5, no imports; any
 * failure (storage blocked) falls back to light.
 */
export const THEME_BOOT_SCRIPT = `(function(){var t="light";try{var p=localStorage.getItem("${THEME_KEY}");if(p==="dark"){t="dark"}else if(p==="system"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}}catch(e){}document.documentElement.dataset.theme=t})();`;
