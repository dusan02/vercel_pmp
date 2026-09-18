'use client';

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
}

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
const COL_GAP = 190; // inter-column spacing incl. node width
const PAD_T = 10;
const PAD_B = 10;

interface Laid {
    node: SankeyNode;
    x: number;
    y: number;
    h: number;
}

export default function SankeyChart({ columns, links, total, formatValue, height = 250 }: SankeyChartProps) {
    const colCount = columns.length;
    const W = Math.max(560, PAD_L + PAD_R + NODE_W + (colCount - 1) * COL_GAP);
    const bandH = height - PAD_T - PAD_B;
    const scale = total > 0 ? bandH / total : 0;

    const colX = (i: number) => PAD_L + i * ((W - PAD_L - PAD_R - NODE_W) / Math.max(1, colCount - 1));

    // Lay out nodes per column — top-aligned, declared order
    const laid = new Map<string, Laid>();
    columns.forEach((col, ci) => {
        let y = PAD_T;
        col.forEach((n) => {
            const h = Math.max(2, n.value * scale);
            laid.set(n.id, { node: n, x: colX(ci), y, h });
            y += h + NODE_GAP;
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
            className="w-full h-auto select-none min-w-[480px]"
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
                    const isFirst = ci === 0;
                    const labelX = isFirst ? l.x + NODE_W + 8 : l.x - 8;
                    const anchor = isFirst ? 'start' : 'end';
                    const labelY = l.y + Math.min(11, l.h / 2 + 4);
                    return (
                        <g key={n.id}>
                            <rect x={l.x} y={l.y} width={NODE_W} height={l.h} rx={2} fill={n.color}>
                                <title>{`${n.label}: ${formatValue(n.value)}${n.sub ? ` (${n.sub})` : ''}`}</title>
                            </rect>
                            <text
                                x={labelX}
                                y={labelY}
                                fontSize={11}
                                fontWeight={600}
                                textAnchor={anchor}
                                className="fill-gray-800 dark:fill-gray-200"
                            >
                                {n.label}
                            </text>
                            <text
                                x={labelX}
                                y={labelY + 12}
                                fontSize={10}
                                textAnchor={anchor}
                                className="fill-gray-500 dark:fill-gray-400"
                            >
                                {`${formatValue(n.value)}${n.sub ? ` · ${n.sub}` : ''}`}
                            </text>
                        </g>
                    );
                }),
            )}
        </svg>
    );
}
