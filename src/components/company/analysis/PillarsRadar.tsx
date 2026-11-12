import type { PillarScores } from './types';
import { pillarSummary } from '@/services/analysis/pillars';

/**
 * Six-axis profile radar: Valuation · Growth · Profitability · Health ·
 * Quality · Moat.
 *
 * A profile, not a verdict — the chart deliberately shows shape only; per-axis
 * leg contributions are exposed via native <title> tooltips and the details
 * block below (a11y + transparency).
 */

// ViewBox 284 wide: gives full breathing room for "PROFITABILITY" on the 30° right axis.
const CX = 142;
const CY = 104;
const R = 55;
const LABEL_R = 80;

/** Axis order — clockwise from top; Moat closes the hexagon at upper-left. */
const AXIS_ORDER = ['valuation', 'growth', 'profitability', 'health', 'quality', 'moat'] as const;

/** Short labels for the SVG — "Financial Health" would clip the viewBox. */
const SHORT_LABEL: Record<(typeof AXIS_ORDER)[number], string> = {
    valuation: 'Valuation',
    growth: 'Growth',
    profitability: 'Profitability',
    health: 'Health',
    quality: 'Quality',
    moat: 'Moat',
};

function axisAngle(i: number): number {
    return (-90 + i * (360 / AXIS_ORDER.length)) * (Math.PI / 180);
}

function point(i: number, radius: number): [number, number] {
    const a = axisAngle(i);
    return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

/** Closed Catmull-Rom spline through the vertices — softer organic shape
    instead of a straight-edged pentagon (curve still passes through the
    exact score points). */
function smoothClosedPath(values: number[]): string {
    const pts = values.map((v, i) => point(i, (v / 100) * R));
    const n = pts.length;
    let d = `M ${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)}`;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n]!;
        const p1 = pts[i]!;
        const p2 = pts[(i + 1) % n]!;
        const p3 = pts[(i + 2) % n]!;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d + ' Z';
}

function ringPoints(frac: number): string {
    return AXIS_ORDER.map((_, i) => point(i, R * frac).join(',')).join(' ');
}

function scoreTextClass(score: number): string {
    if (score >= 75) return 'fill-emerald-600 dark:fill-emerald-400';
    if (score >= 50) return 'fill-amber-600 dark:fill-amber-400';
    return 'fill-rose-600 dark:fill-rose-400';
}

function chipScoreClass(score: number): string {
    if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
}

function scoreDotClass(score: number): string {
    if (score >= 75) return 'fill-emerald-500';
    if (score >= 50) return 'fill-amber-500';
    return 'fill-rose-500';
}

function bandLabel(score: number): string {
    return score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'Weak';
}

function straightPath(values: number[]): string {
    return values.map((v, i) => point(i, (Math.max(0, Math.min(100, v)) / 100) * R).map(n => n.toFixed(2)).join(',')).join(' ');
}

function fmtDelta(d: number): string {
    return d > 0 ? `+${d}` : `${d}`;
}

export interface RadarOverlay {
    label: string;
    scores: Record<string, number>;
}

function legBreakdown(p: { label: string; score: number; legs: { label: string; display: string; points: number; max: number }[] }): string {
    const lines = p.legs.map(l => `${l.label}: ${l.display} → ${l.points}/${l.max}`);
    return `${p.label} — ${p.score}/100 (${bandLabel(p.score)})\n${lines.join('\n')}`;
}

export default function PillarsRadar({
    pillars,
    previous,
    peer,
}: {
    pillars: PillarScores;
    /** Same scores ~30 days ago — dotted ghost + per-axis delta. */
    previous?: { asOf: string; scores: Record<string, number> } | null;
    /** Peer-median scores (industry or sector) — dashed gray polygon. */
    peer?: { label: string; n: number; scores: Record<string, number> } | null;
}) {
    // Tolerate a pillar missing from a stale serialized payload (e.g. a
    // pre-deploy Redis analysis:cache row) — render the axis at 0 instead
    // of crashing the whole page.
    const axes = AXIS_ORDER.map(k => pillars[k] ?? null);
    const values = axes.map(p => p?.score ?? 0);
    const prevValues = previous ? AXIS_ORDER.map(k => previous.scores[k]) : null;
    const hasPrev = !!prevValues && prevValues.every(v => typeof v === 'number')
        && prevValues.some((v, i) => v !== values[i]);
    const peerValues = peer ? AXIS_ORDER.map(k => peer.scores[k]) : null;
    const hasPeer = !!peerValues && peerValues.every(v => typeof v === 'number');
    const deltaOf = (k: (typeof AXIS_ORDER)[number], score: number) =>
        hasPrev ? score - (previous!.scores[k] ?? score) : 0;

    return (
        <section className="h-full flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900" aria-label="Company profile scores">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Profile
            </h2>
            <svg
                viewBox="0 0 284 206"
                className="mt-0.5 w-full max-h-[190px]"
                role="img"
                aria-label={`Radar profile: ${axes.map((p, i) => `${p?.label ?? SHORT_LABEL[AXIS_ORDER[i]!]} ${p?.score ?? 0}`).join(', ')}`}
            >
                {/* grid rings */}
                {[0.25, 0.5, 0.75, 1].map(f => (
                    <polygon
                        key={f}
                        points={ringPoints(f)}
                        fill="none"
                        className="stroke-gray-200 dark:stroke-gray-700"
                        strokeWidth={f === 1 ? 1.2 : 0.7}
                    />
                ))}
                {/* axis lines */}
                {AXIS_ORDER.map((k, i) => {
                    const [x, y] = point(i, R);
                    return <line key={k} x1={CX} y1={CY} x2={x} y2={y} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="0.7" />;
                })}
                {/* peer median — dashed straight polygon behind the profile */}
                {hasPeer && (
                    <polygon
                        points={straightPath(peerValues as number[])}
                        fill="none"
                        className="stroke-gray-400 dark:stroke-gray-500"
                        strokeWidth="1"
                        strokeDasharray="3 2"
                    />
                )}
                {/* ~30 days ago — dotted ghost */}
                {hasPrev && (
                    <path
                        d={smoothClosedPath(prevValues as number[])}
                        fill="none"
                        className="stroke-sky-500/70"
                        strokeWidth="1.2"
                        strokeDasharray="1.5 2"
                    />
                )}
                {/* value polygon — smooth spline through the score points */}
                <path
                    d={smoothClosedPath(values)}
                    className="fill-emerald-500/15 stroke-emerald-500"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                />
                {/* vertex dots + axis labels */}
                {axes.map((p, i) => {
                    const key = AXIS_ORDER[i]!;
                    const score = p?.score ?? 0;
                    const [vx, vy] = point(i, (score / 100) * R);
                    const [lx, ly] = point(i, LABEL_R);
                    const a = axisAngle(i);
                    const sin = Math.sin(a);
                    const cos = Math.cos(a);
                    const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
                    // Top axis labels sit above the vertex; bottom ones below.
                    const nameY = sin < -0.3 ? ly - 8 : sin > 0.3 ? ly + 4 : ly - 4;
                    const scoreY = nameY + 12;
                    const delta = deltaOf(key, score);
                    return (
                        <g key={key}>
                            {p && <title>{legBreakdown(p)}</title>}
                            <circle cx={vx} cy={vy} r="3" className={scoreDotClass(score)} />
                            <text x={lx} y={nameY} textAnchor={anchor} className="fill-gray-500 dark:fill-gray-400" fontSize="8" fontWeight="600" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {SHORT_LABEL[key]}
                            </text>
                            <text x={lx} y={scoreY} textAnchor={anchor} className={scoreTextClass(score)} fontSize="10" fontWeight="700">
                                {score}
                                {delta !== 0 && Math.abs(delta) >= 3 && (
                                    <tspan fontSize="7" fontWeight="600" className={delta > 0 ? 'fill-emerald-600 dark:fill-emerald-400' : 'fill-rose-600 dark:fill-rose-400'}>
                                        {' '}{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                                    </tspan>
                                )}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {(hasPeer || hasPrev) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-0.5 w-3 bg-emerald-500" aria-hidden /> Now
                    </span>
                    {hasPeer && (
                        <span className="inline-flex items-center gap-1" title={`Median of ${peer!.n} ${peer!.label} stocks`}>
                            <span className="inline-block w-3 border-t border-dashed border-gray-400" aria-hidden /> {peer!.label} median
                        </span>
                    )}
                    {hasPrev && (
                        <span className="inline-flex items-center gap-1" title={`Same model on the data available on ${previous!.asOf}`}>
                            <span className="inline-block w-3 border-t border-dotted border-sky-500" aria-hidden /> 30 days ago
                        </span>
                    )}
                </div>
            )}

            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {pillarSummary(pillars)}
            </p>

            <details className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                <summary className="cursor-pointer select-none font-medium hover:text-gray-700 dark:hover:text-gray-200">
                    How is each axis scored?
                </summary>
                <ul className="mt-2 space-y-2">
                    {axes.filter((p): p is NonNullable<typeof p> => p != null).map(p => (
                        <li key={p.key}>
                            <div className="flex items-baseline justify-between">
                                <span className="font-semibold text-gray-700 dark:text-gray-200">{p.label}</span>
                                <span className={scoreTextClass(p.score).replace('fill-', 'text-')}>
                                    {p.score}/100 · {bandLabel(p.score)}
                                    {hasPrev && deltaOf(p.key, p.score) !== 0 && (
                                        <span className="ml-1 text-gray-400 dark:text-gray-500">({fmtDelta(deltaOf(p.key, p.score))} vs 30d)</span>
                                    )}
                                    {hasPeer && (
                                        <span className="ml-1 text-gray-400 dark:text-gray-500">· peers {peer!.scores[p.key]}</span>
                                    )}
                                </span>
                            </div>
                            <ul className="mt-0.5 space-y-0.5 pl-2">
                                {p.legs.map(l => (
                                    <li key={l.key}>
                                        <div className="flex justify-between gap-2">
                                            <span>{l.label} <span className="text-gray-400 dark:text-gray-500">({l.display})</span></span>
                                            <span className="tabular-nums text-gray-400 dark:text-gray-500">{l.points}/{l.max}</span>
                                        </div>
                                        {l.note && <p className="mt-0.5 text-[10px] leading-snug text-amber-600 dark:text-amber-400">{l.note}</p>}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            </details>
        </section>
    );
}

/** One-line chip strip — "V 40 · G 87 · P 100 · H 67 · Q 54 · M 81". Rendered
    only below `lg` (call site uses lg:hidden): on desktop the radar card
    carries the profile, on mobile it sits ~1100px deep behind the price
    chart, so the chips keep the six-axis profile in the first viewport. */
export function PillarChips({ pillars }: { pillars: PillarScores }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Profile scores">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mr-0.5">
                Profile
            </span>
            {AXIS_ORDER.map(k => {
                const p = pillars[k] ?? null;
                return (
                    <span
                        key={k}
                        title={`${p?.label ?? SHORT_LABEL[k]}: ${p?.score ?? 0}/100`}
                        className="inline-flex items-baseline gap-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-1.5 py-0.5"
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{k[0]}</span>
                        <span className={`text-[11px] font-bold tabular-nums ${chipScoreClass(p?.score ?? 0)}`}>{p?.score ?? '–'}</span>
                    </span>
                );
            })}
        </div>
    );
}
