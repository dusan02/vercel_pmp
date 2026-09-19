/**
 * Shared chart typography — single source so every chart on the analysis
 * page uses identical font sizes instead of ad-hoc literals drifting
 * between 8–12px.
 */
export const CHART_FONT = {
    /** Axis tick labels (recharts `tick={{ fontSize }}`) */
    axis: 11,
    /** Reference-line / in-plot annotation labels and legends */
    annotation: 10,
    /** Sankey node name */
    sankeyLabel: 13,
    /** Sankey node value + sub-label */
    sankeyValue: 11.5,
} as const;
