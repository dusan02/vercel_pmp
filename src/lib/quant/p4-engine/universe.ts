import https from 'https';
import { UniverseConstituent, CandidateUniverseSource } from './universe-types.js';

export class PointInTimeUniverse {
    private apiKey: string;
    private candidateSource: CandidateUniverseSource;

    constructor(apiKey: string, candidateSource: CandidateUniverseSource) {
        if (!apiKey) throw new Error("API Key required");
        this.apiKey = apiKey;
        this.candidateSource = candidateSource;
    }

    private async fetchJson(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode === 429) return reject(new Error("API Rate Limit"));
                if (res.statusCode !== 200 && res.statusCode !== 404) return reject(new Error(`HTTP ${res.statusCode} at ${url}`));
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 404) resolve(null);
                    else {
                        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
                    }
                });
            }).on('error', reject);
        });
    }

    async getConstituentHistoricalState(cik: string, dateT: Date): Promise<UniverseConstituent | null> {
        const dateStr = dateT.toISOString().split('T')[0];
        const url = `https://api.polygon.io/v3/reference/tickers?cik=${cik}&date=${dateStr}&apiKey=${this.apiKey}`;
        const res = await this.fetchJson(url);
        
        if (!res || !Array.isArray(res.results) || res.results.length === 0) {
            return null;
        }

        // Polygon handles the historical query. We must sort by last_updated to be deterministic.
        const validResults = res.results.sort((a: any, b: any) => new Date(b.last_updated_utc).getTime() - new Date(a.last_updated_utc).getTime());
        const primary = validResults[0];

        // 1. Identifiable: The CIK correctly resolves to a company structure on this date.
        const isIdentifiable = true;
        
        // 2. Listed: active = true, and it has a recognized primary exchange.
        const isListed = primary.active === true && !!primary.primary_exchange;
        
        // 3. Tradeable: Listed AND not OTC AND market == 'stocks' (Not an index or option).
        // Note: As per Polygon's terms, data is not guaranteed, but this is the structural proxy for tradeability.
        const isTradeable = isListed && primary.market === 'stocks' && primary.primary_exchange !== "OTC" && primary.primary_exchange !== "OTCM";

        return {
            cik: cik,
            ticker: primary.ticker,
            identifiableAt: dateT,
            listedAt: isListed ? dateT : null,
            delistedAt: primary.delisted_utc ? new Date(primary.delisted_utc) : null,
            exchange: primary.primary_exchange || null,
            securityType: primary.type || null,
            
            isIdentifiable,
            isListed,
            isTradeable,
            isEligible: false // Determined strictly by the higher-level backtest engine after passing all pipeline checks
        };
    }

    async getEligibleUniverseAt(dateT: Date): Promise<UniverseConstituent[]> {
        const ciks = await this.candidateSource.getCandidateCiks(dateT);
        const valid: UniverseConstituent[] = [];
        for (const cik of ciks) {
            const status = await this.getConstituentHistoricalState(cik, dateT);
            if (status && status.isTradeable) {
                status.isEligible = true;
                valid.push(status);
            }
        }
        return valid;
    }
}
