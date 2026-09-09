import { PitFundamental, MarketBar, PitEstimate, Instant } from './temporal-types.js';

export class TemporalSnapshot {
    public readonly observationTime: Instant;
    public readonly maxInformationAvailableAt: Instant;
    public readonly fundamentals: ReadonlyArray<Readonly<PitFundamental>>;
    public readonly estimates: ReadonlyArray<Readonly<PitEstimate>>;
    public readonly marketBars: ReadonlyArray<Readonly<MarketBar>>;
    public readonly benchmarkBars: ReadonlyArray<Readonly<MarketBar>>;
    public readonly cik: string;
    public readonly ticker: string;

    constructor(
        cik: string,
        ticker: string,
        observationTime: Instant,
        fundamentals: PitFundamental[],
        estimates: PitEstimate[],
        marketBars: MarketBar[],
        benchmarkBars: MarketBar[]
    ) {
        this.cik = cik;
        this.ticker = ticker;
        this.observationTime = observationTime;
        
        this.fundamentals = Object.freeze(fundamentals.map(f => Object.freeze({ ...f })));
        this.estimates = Object.freeze(estimates.map(e => Object.freeze({ ...e })));
        this.marketBars = Object.freeze(marketBars.map(b => Object.freeze({ ...b })));
        this.benchmarkBars = Object.freeze(benchmarkBars.map(b => Object.freeze({ ...b })));
        
        let maxInfo: Instant = "1970-01-01T00:00:00.000Z";
        for (const f of this.fundamentals) {
            if (f.acceptanceDateTime > maxInfo) maxInfo = f.acceptanceDateTime;
        }
        for (const e of this.estimates) {
            if (e.knownAt > maxInfo) maxInfo = e.knownAt;
        }
        
        if (maxInfo > observationTime) {
            throw new Error(`HARD FAIL: Snapshot contains future information.`);
        }

        this.maxInformationAvailableAt = maxInfo;
        Object.freeze(this);
    }
}
