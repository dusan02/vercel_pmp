import type { PillarScores } from './types';

/**
 * Five-axis profile radar: Valuation · Growth · Profitability · Health · Quality.
 *
 * A profile, not a verdict — the chart deliberately shows shape only; per-axis
 * leg contributions are exposed via native <title> tooltips and the details
 * block below (a11y + transparency).
 */

const CX = 120;
const CY = 110;
const R = 58;
const LABEL_R = 84;

/** Axis order — clockwise from top. */
const AXIS_ORDER = ['valuation', 'growth', 'profitability', 'health', 'quality'] as const;

/** Short labels for the SVG — "Financial Health" would clip the viewBox. */
const SHORT_LABEL: Record<(typeof AXIS_ORDER)[number], string> = {
    valuation: 'Valuation',
    growth: 'Growth',
    profitability: 'Profitability',
    health: 'Health',
    quality: 'Quality',
};

function axisAngle(i: number): number {
    return (-90 + i * 72) * (Math.PI / 180);
}

function point(i: number, radius: number): [number, number] {
    const a = axisAngle(i);
    return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
}

function polygonPoints(values: number[]): string {
    return values.map((v, i) => point(i, (v / 100) * R).join(',')).join(' ');
}

function ringPoints(frac: number): string {
    return AXIS_ORDER.map((_, i) => point(i, R * frac).join(',')).join(' ');
}

function scoreTextClass(score: number): string {
    if (score >= 75) return 'fill-emerald-600 dark:fill-emerald-400';
    if (score >= 50) return 'fill-amber-600 dark:fill-amber-400';
    return 'fill-rose-600 dark:fill-rose-400';
}

function scoreDotClass(score: number): string {
    if (score >= 75) return 'fill-emerald-500';
    if (score >= 50) return 'fill-amber-500';
    return 'fill-rose-500';
}

function bandLabel(score: number): string {
    return score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'Weak';
}

function legBreakdown(p: { label: string; score: number; legs: { label: string; display: string; points: number; max: number }[] }): string {
    const lines = p.legs.map(l => `${l.label}: ${l.display} → ${l.points}/${l.max}`);
    return `${p.label} — ${p.score}/100 (${bandLabel(p.score)})\n${lines.join('\n')}`;
}

export default function PillarsRadar({ pillars }: { pillars: PillarScores }) {
    const axes = AXIS_ORDER.map(k => pillars[k]);
    const values = axes.map(p => p.score);

    return (
        <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900" aria-label="Company profile scores">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Profile
            </h2>
            <svg
                viewBox="0 0 240 200"
                className="mt-1 w-full"
                role="img"
                aria-label={`Radar profile: ${axes.map(p => `${p.label} ${p.score}`).join(', ')}`}
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
                {/* value polygon */}
                <polygon
                    points={polygonPoints(values)}
                    className="fill-emerald-500/15 stroke-emerald-500"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                />
                {/* vertex dots + axis labels */}
                {axes.map((p, i) => {
                    const [vx, vy] = point(i, (p.score / 100) * R);
                    const [lx, ly] = point(i, LABEL_R);
                    const a = axisAngle(i);
                    const sin = Math.sin(a);
                    const cos = Math.cos(a);
                    const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
                    // Top axis labels sit above the vertex; bottom ones below.
                    const nameY = sin < -0.3 ? ly - 8 : sin > 0.3 ? ly + 4 : ly - 4;
                    const scoreY = nameY + 12;
                    return (
                        <g key={p.key}>
                            <title>{legBreakdown(p)}</title>
                            <circle cx={vx} cy={vy} r="3" className={scoreDotClass(p.score)} />
                            <text x={lx} y={nameY} textAnchor={anchor} className="fill-gray-500 dark:fill-gray-400" fontSize="8" fontWeight="600" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {SHORT_LABEL[p.key]}
                            </text>
                            <text x={lx} y={scoreY} textAnchor={anchor} className={scoreTextClass(p.score)} fontSize="10" fontWeight="700">
                                {p.score}
                            </text>
                        </g>
                    );
                })}
            </svg>

            <details className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                <summary className="cursor-pointer select-none font-medium hover:text-gray-700 dark:hover:text-gray-200">
                    How is each axis scored?
                </summary>
                <ul className="mt-2 space-y-2">
                    {axes.map(p => (
                        <li key={p.key}>
                            <div className="flex items-baseline justify-between">
                                <span className="font-semibold text-gray-700 dark:text-gray-200">{p.label}</span>
                                <span className={scoreTextClass(p.score).replace('fill-', 'text-')}>{p.score}/100 · {bandLabel(p.score)}</span>
                            </div>
                            <ul className="mt-0.5 space-y-0.5 pl-2">
                                {p.legs.map(l => (
                                    <li key={l.key} className="flex justify-between gap-2">
                                        <span>{l.label} <span className="text-gray-400 dark:text-gray-500">({l.display})</span></span>
                                        <span className="tabular-nums text-gray-400 dark:text-gray-500">{l.points}/{l.max}</span>
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
