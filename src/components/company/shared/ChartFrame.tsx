import React from 'react';

/**
 * Uniform chart-card anatomy — every paired chart in the analysis grid uses
 * the same vertical slots so plot areas start and end at identical heights
 * regardless of how much chrome each card carries:
 *
 *   [ChartSection title]  — constant height (truncated subtitle)
 *   [ChartControls]       — fixed single-row band for toggles (never wraps)
 *   [ChartPlot]           — flex-1, absorbs leftover space
 *   [ChartFootnote]       — reserved annotation slot (verdicts, legends, notes)
 *
 * Without this, a card with a big header (verdict + badges + legend) pushes
 * its plot down while the paired card's plot starts higher and leaves dead
 * space at the bottom.
 */

export function ChartBody({ children }: { children: React.ReactNode }) {
    return <div className="w-full h-full flex flex-col">{children}</div>;
}

/** Single-row controls band under the section title. `flex-nowrap` +
 *  horizontal scroll prevents wrapping — a wrapped second row would push
 *  the plot down and break alignment with the paired card. */
export function ChartControls({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`flex h-9 items-center gap-2 flex-nowrap overflow-x-auto mb-3 ${className}`}>
            {children}
        </div>
    );
}

/** Plot area — fills all remaining vertical space in the card so chart
 *  bottoms align. Render ResponsiveContainer at height="100%" inside. */
export function ChartPlot({ children, minHeight = 240, className = '' }: { children: React.ReactNode; minHeight?: number; className?: string }) {
    return (
        <div className={`relative w-full flex-1 min-h-0 ${className}`} style={{ minHeight }}>
            {children}
        </div>
    );
}

/** Annotation slot under the plot — conclusions, badges, legends, notes.
 *  Rendered even when empty so every card reserves the same bottom band and
 *  plot heights stay uniform across the grid. */
export function ChartFootnote({ children }: { children?: React.ReactNode }) {
    return (
        <div className="mt-2 min-h-[3.25rem] flex flex-col justify-center gap-1.5">
            {children}
        </div>
    );
}
