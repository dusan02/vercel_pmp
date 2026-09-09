// Task G: RS Engine Module
export class RsEngine {
    
    // Explicit 21-session RS calculation, throws on gaps, strictly aligns to benchmark calendar
    static calculateRs(assetBars: Map<string, number>, benchBars: Map<string, number>): number {
        const calendar = Array.from(benchBars.keys()).sort();
        
        if (calendar.length < 22) throw new Error("Insufficient history: requires at least 22 trading sessions.");
        
        // Enforce gap invariant: for every day the benchmark traded, the asset MUST have traded OR be explicitly marked HALTED.
        // Since we don't have authoritative halts here, missing data => Hard Fail.
        for (const tDay of calendar) {
            if (!assetBars.has(tDay)) {
                throw new Error(`DATA_MISSING / GAP INVARIANT VIOLATION: Asset missing data on trading session ${tDay}`);
            }
        }
        
        const idxT = calendar.length - 1;
        const idxT21 = idxT - 21; // Exactly 21 trading sessions ago
        
        const dateT = calendar[idxT];
        const dateT21 = calendar[idxT21];
        
        const assetT = assetBars.get(dateT)!;
        const assetT21 = assetBars.get(dateT21)!;
        const benchT = benchBars.get(dateT)!;
        const benchT21 = benchBars.get(dateT21)!;
        
        const assetRet = (assetT / assetT21) - 1;
        const benchRet = (benchT / benchT21) - 1;
        
        return ((1 + assetRet) / (1 + benchRet)) - 1;
    }
}
