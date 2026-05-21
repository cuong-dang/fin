import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";

/**
 * Recharts (under Mantine's chart wrappers) defaults to
 * `trigger="hover"` on its Tooltip. On touch devices the very first
 * finger contact counts as a hover — so swiping past a chart to
 * scroll the page makes tooltips flicker open under the user's
 * thumb. On coarse-pointer devices we switch to `trigger="click"`
 * so tooltips only appear on a deliberate tap.
 *
 * Click-triggered tooltips are *sticky* — Recharts doesn't dismiss
 * them when the user taps outside the chart. To handle that, we
 * also expose a `wrapperRef` + `resetKey`. Wrap the chart in a div
 * with `wrapperRef`, pass `key={resetKey}` to the chart, and a tap
 * outside increments the key, remounting the chart and clearing the
 * stuck tooltip.
 *
 * Critical: we listen on `click` (not `mousedown` / `touchstart`).
 * Recharts handles the click-to-show on `mousedown`, so an earlier
 * mousedown-listener would race with it on chart-internal taps
 * and starve Recharts of the event. `click` fires after the chart
 * has done its work — by then "inside vs outside" is decided
 * cleanly via `contains()` and the outside reset doesn't interfere.
 *
 * On fine-pointer devices `tooltipProps` is `{}` and `resetKey`
 * never changes — behavior matches the original hover-default.
 *
 *   const { tooltipProps, wrapperRef, resetKey } = useTouchAwareTooltip();
 *   return (
 *     <div ref={wrapperRef}>
 *       <Chart key={resetKey} tooltipProps={tooltipProps} ... />
 *     </div>
 *   );
 */
export function useTouchAwareTooltip() {
  const coarse = useMediaQuery("(pointer: coarse)") ?? false;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!coarse) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || !wrapperRef.current) return;
      if (!wrapperRef.current.contains(target)) {
        setResetKey((k) => k + 1);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [coarse]);

  return {
    tooltipProps: coarse ? ({ trigger: "click" } as const) : {},
    wrapperRef,
    resetKey,
  };
}
