/**
 * Lightweight dependency-free Sankey diagram for financial flows.
 * Fixed column layout (each column stacks nodes top→bottom), ribbon links
 * proportional to flow value. Columns share a common scale so link widths
 * stay truthful across stages.
 */

export interface SankeyNode {
    id: string;
    label: string;
    /** Absolute value (>= 0 for rendering; negatives handled by caller as abs + styling) */
    value: number;
    color: string;
    /** Optional small annotation after the value, e.g. "62% of revenue" */
    sub?: string | undefined;
    /** Force label side — 'right' renders into the following gap. Use on
     * middle columns whose default left-side label would collide with the
     * previous column's right-going labels (e.g. balance-sheet mid nodes). */
    labelSide?: 'left' | 'right' | undefined;
}

import { CHART_FONT } from './chartTheme';

export interface SankeyLink {
    from: string;
    to: string;
    value: number;
}

interface SankeyChartProps {
    /** Nodes grouped by column, top→bottom order within each column */
    columns: SankeyNode[][];
    links: SankeyLink[];
    /** Scale basis — the value that maps to the full column band height */
    total: number;
    formatValue: (v: number) => string;
    height?: number;
}

const NODE_W = 12;
const NODE_GAP = 14;
// Labels live inside the inter-column gaps (first column → right, others →
// left), so the outer margins only need a few px — reserving a full label
// band on each side wastes ~300px of dead space.
const PAD_L = 10;
const PAD_R = 10;
// Inter-column spacing incl. node width. Node labels are capped ~17 chars so
// they fit the ~115px budget a gap leaves after node + margins — narrower
// gaps keep the viewBox tight, which keeps the rendered font effective
// (a 6-column balance sheet at 190px gaps shrinks text to ~7px).
const COL_GAP = 145;
const PAD_T = 10;
const PAD_B = 10;
// Minimum node heights for label rows to fit without crowding
const SHOW_LABEL_MIN_H = 10;
const SHOW_VALUE_MIN_H = 26;
const LABEL_BLOCK_2 = 30; // label + value rows
const LABEL_BLOCK_1 = 16; // label only

/** viewBox width the chart will use for a given column count — callers
 *  need it to back-compute a viewBox height that fills a measured box. */
export function sankeyViewBoxWidth(colCount: number) {
    return Math.max(560, PAD_L + PAD_R + NODE_W + (colCount - 1) * COL_GAP);
}

interface Laid {
    node: SankeyNode;
    x: number;
    y: number;
    h: number;
}

export default function SankeyChart({ columns, links, total, formatValue, height = 250 }: SankeyChartProps) {
    const colCount = columns.length;
    const W = sankeyViewBoxWidth(colCount);
    const bandH = height - PAD_T - PAD_B;
    // Tallest column fills ~62% of the band — single-node "total" pillars
    // (Total Assets, FCF) then render as a centered bar instead of a
    // wall-to-wall slab; every column is additionally centered vertically.
    const scale = total > 0 ? (bandH * 0.62) / total : 0;

    const colX = (i: number) => PAD_L + i * ((W - PAD_L - PAD_R - NODE_W) / Math.max(1, colCount - 1));

    // Lay out nodes per column — vertically centered stack, declared order
    const laid = new Map<string, Laid>();
    columns.forEach((col, ci) => {
        const heights = col.map((n) => Math.max(2, n.value * scale));
        const used = heights.reduce((a, b) => a + b, 0) + NODE_GAP * Math.max(0, col.length - 1);
        let y = PAD_T + Math.max(0, (bandH - used) / 2);
        col.forEach((n, i) => {
            laid.set(n.id, { node: n, x: colX(ci), y, h: heights[i]! });
            y += heights[i]! + NODE_GAP;
        });
    });

    // Label de-overlap: two adjacent nodes in one column get centred labels a
    // few px apart that overlap (e.g. thin CapEx right above a huge FCF block).
    // Enforce a minimum gap between label-block edges, pushing labels down.
    const labelCenter = new Map<string, number>();
    columns.forEach((col) => {
        let prevBottom = -Infinity;
        [...col]
            .sort((a, b) => (laid.get(a.id)?.y ?? 0) - (laid.get(b.id)?.y ?? 0))
            .forEach((n) => {
                const l = laid.get(n.id);
                if (!l || l.h < SHOW_LABEL_MIN_H) return;
                const blockH = l.h >= SHOW_VALUE_MIN_H ? LABEL_BLOCK_2 : LABEL_BLOCK_1;
                let center = l.y + l.h / 2;
                if (center - blockH / 2 < prevBottom + 3) center = prevBottom + 3 + blockH / 2;
                prevBottom = center + blockH / 2;
                labelCenter.set(n.id, center);
            });
    });

    // Compute link ribbons — track running offsets so flows stack inside nodes
    const outOffset = new Map<string, number>();
    const inOffset = new Map<string, number>();
    const linkPaths = links.flatMap((l) => {
        const s = laid.get(l.from);
        const t = laid.get(l.to);
        if (!s || !t || l.value <= 0) return [];
        const w = Math.max(1, l.value * scale);
        const so = outOffset.get(l.from) ?? 0;
        const ti = inOffset.get(l.to) ?? 0;
        outOffset.set(l.from, so + w);
        inOffset.set(l.to, ti + w);
        const x0 = s.x + NODE_W;
        const x1 = t.x;
        const y0 = s.y + so;
        const y1 = t.y + ti;
        const cx = (x0 + x1) / 2;
        const d =
            `M ${x0},${y0} ` +
            `C ${cx},${y0} ${cx},${y1} ${x1},${y1} ` +
            `L ${x1},${y1 + w} ` +
            `C ${cx},${y1 + w} ${cx},${y0 + w} ${x0},${y0 + w} Z`;
        return [{ d, color: s.node.color, key: `${l.from}->${l.to}`, title: `${s.node.label} → ${t.node.label}: ${formatValue(l.value)}` }];
    });

    return (
        <svg
            viewBox={`0 0 ${W} ${height}`}
            className="w-full h-auto select-none min-w-[560px]"
            role="img"
            aria-label="Financial flows diagram"
        >
            {linkPaths.map((p) => (
                <path key={p.key} d={p.d} fill={p.color} opacity={0.28}>
                    <title>{p.title}</title>
                </path>
            ))}

            {columns.map((col, ci) =>
                col.map((n) => {
                    const l = laid.get(n.id);
                    if (!l) return null;
                    const side = n.labelSide ?? (ci === 0 ? 'right' : 'left');
                    const labelX = side === 'right' ? l.x + NODE_W + 8 : l.x - 8;
                    const anchor = side === 'right' ? 'start' : 'end';
                    // Dense columns (balance sheet leaves) — thin nodes can't
                    // carry a 2-line label without colliding with neighbours.
                    const showLabel = l.h >= SHOW_LABEL_MIN_H;
                    const showValue = l.h >= SHOW_VALUE_MIN_H;
                    const lc = labelCenter.get(n.id) ?? l.y + l.h / 2;
                    return (
                        <g key={n.id}>
                            <rect x={l.x} y={l.y} width={NODE_W} height={l.h} rx={2} fill={n.color}>
                                <title>{`${n.label}: ${formatValue(n.value)}${n.sub ? ` (${n.sub})` : ''}`}</title>
                            </rect>
                            {showLabel && (
                                <text
                                    x={labelX}
                                    y={showValue ? lc - 2 : lc + 5}
                                    fontSize={CHART_FONT.sankeyLabel}
                                    fontWeight={600}
                                    textAnchor={anchor}
                                    className="fill-gray-800 dark:fill-gray-200"
                                >
                                    {n.label}
                                </text>
                            )}
                            {showValue && (
                                <text
                                    x={labelX}
                                    y={lc + 13}
                                    fontSize={CHART_FONT.sankeyValue}
                                    textAnchor={anchor}
                                    className="fill-gray-500 dark:fill-gray-400"
                                >
                                    {`${formatValue(n.value)}${n.sub ? ` · ${n.sub}` : ''}`}
                                </text>
                            )}
                        </g>
                    );
                }),
            )}
        </svg>
    );
}
