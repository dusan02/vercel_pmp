import https from 'https';

export class IdentityEngine {
    private apiKey: string;

    constructor(apiKey: string) {
        if (!apiKey) throw new Error("API Key required for IdentityEngine");
        this.apiKey = apiKey;
    }

    private async fetchJson(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode !== 200 && res.statusCode !== 404) return reject(new Error(`HTTP ${res.statusCode}`));
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

    // Task F: Historical Identity Resolution
    async getTickerForCikAtDate(cik: string, effectiveDate: string): Promise<string | null> {
        const url = `https://api.polygon.io/v3/reference/tickers?cik=${cik}&date=${effectiveDate}&apiKey=${this.apiKey}`;
        const res = await this.fetchJson(url);
        
        // Fix array truthiness
        if (!res || !Array.isArray(res.results) || res.results.length === 0) return null;

        // In Polygon, if multiple exist, we must rely on the exact match provided by Polygon's effective date filtering.
        // We sort by last_updated_utc as a fallback to get the most authoritative record if duplicates exist on the exact same date.
        const sorted = res.results.sort((a: any, b: any) => new Date(b.last_updated_utc).getTime() - new Date(a.last_updated_utc).getTime());
        return sorted[0].ticker;
    }
}
