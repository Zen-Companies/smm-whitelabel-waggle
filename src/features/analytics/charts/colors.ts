// Chart colors (T49-T52), checked with the dataviz colorblind checker. Series colors are only
// for marks: text always uses the ink tokens, and honey (under 3:1 on white) always comes with
// direct labels and, with two or more series, a legend.

export const SERIES_1 = "#E5A50F"; // honey
export const SERIES_2 = "#2A78D6"; // blue
export const PREVIOUS = "#A1A1AA"; // the previous period, dashed
export const GRID = "var(--subtle)";
export const AXIS = "var(--line-strong)";

/** Single-hue sequential ramp for the heatmap, fewer → more. */
export const RAMP = [
  "#FFFBEB",
  "#FEF3C7",
  "#FDE68A",
  "#FCD34D",
  "#F5B014",
  "#D97706",
  "#92400E",
] as const;

/** Instagram honey, Facebook blue, wherever platforms are compared. */
export const platformColor = (platform: string) => (platform === "facebook" ? SERIES_2 : SERIES_1);
