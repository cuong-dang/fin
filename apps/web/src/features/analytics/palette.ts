/**
 * Qualitative palette for stacked-chart series. SortedAreaChart
 * assigns these by rank — biggest stack gets `PALETTE[0]`, next gets
 * `PALETTE[1]`, etc. — so the order doubles as a priority order:
 * earlier entries are seen more often.
 *
 * Ordering principle: at .6 shade, all the saturated entries have
 * similar lightness, so adjacency-readability is dominated by hue
 * distance on the color wheel. Adjacent palette entries are kept
 * ≥120° apart, so no two cluster-mates (purples grape/violet/indigo;
 * cool blues blue/cyan/teal; warms red/orange/yellow/pink) land next
 * to each other. `blue` leads to match Mantine's default
 * `theme.primaryColor`. `dark` and `gray` are achromatic — high
 * contrast against any vivid color but very similar to each other,
 * so they're spaced 6 positions apart with vivid colors before and
 * after each.
 */
export const PALETTE = [
  "blue.6",
  "red.6",
  "teal.6",
  "grape.6",
  "green.6",
  "pink.6",
  "cyan.6",
  "dark.6",
  "orange.6",
  "indigo.6",
  "lime.6",
  "violet.6",
  "yellow.6",
  "gray.6",
];
