/**
 * Cross-chart layout constants. Anything that needs to stay in sync
 * across the chart wrappers (DivergingNetChart, etc.) lives here so
 * visuals can't drift between them.
 */

/**
 * Pixels of right-side margin to reserve when point labels are on.
 * Without it, the last period's label clips against the SVG edge —
 * negative-signed values are the worst case. Tuned for USD-style
 * amounts up to ~$999,999.99; revisit if longer formats appear.
 */
export const POINT_LABEL_MARGIN_RIGHT = 50;
