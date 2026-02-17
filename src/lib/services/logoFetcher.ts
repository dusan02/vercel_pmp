
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import * as si from 'simple-icons';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

type LogoFetchResult = {
    buffer: Buffer;
    source: 'polygon' | 'finnhub' | 'domain' | 'fallback';
    contentType: string;
};

export class LogoFetcher {
    private prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    // --- Public Methods ---

    async fetchAndSave(ticker: string): Promise<string | null> {
        try {
            const result = await this.fetchLogoStrategies(ticker);
            if (result) {
                return await this.saveBufferToWebP(result.buffer, ticker);
            }
        } catch (e) {
            console.error(`Error fetching logo for ${ticker}:`, e);
        }
        return null;
    }

    // For API usage - returns buffer directly
    async fetchBuffer(ticker: string): Promise<LogoFetchResult | null> {
        return await this.fetchLogoStrategies(ticker);
    }

    // --- Internal Strategies ---

    private async fetchLogoStrategies(ticker: string): Promise<LogoFetchResult | null> {
        // 1. Polygon
        const polygon = await this.fetchFromPolygon(ticker);
        if (polygon) return { ...polygon, source: 'polygon' };

        // 2. Finnhub
        const finnhub = await this.fetchFromFinnhub(ticker);
        if (finnhub) return { ...finnhub, source: 'finnhub' };

        // 3. Domain Fallback
        const domain = await this.fetchFromDomain(ticker);
        if (domain) return { ...domain, source: 'domain' };

        return null;
    }

    private async fetchWithTimeout(url: string, timeout = 5000): Promise<Response> {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PMPLogoBot/1.0)' }
            });
            clearTimeout(id);
            return res;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    }

    private async fetchFromPolygon(ticker: string): Promise<{ buffer: Buffer, contentType: string } | null> {
        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) return null;

        try {
            const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
            const res = await this.fetchWithTimeout(url);
            if (!res.ok) return null;

            const data = await res.json();
            const logoUrl = data.results?.branding?.icon_url || data.results?.branding?.logo_url;

            if (logoUrl) {
                let fetchUrl = logoUrl;
                if (fetchUrl.includes('api.polygon.io') && !fetchUrl.includes('apiKey=')) {
                    fetchUrl += `?apiKey=${apiKey}`;
                }
                const imgRes = await this.fetchWithTimeout(fetchUrl);
                if (imgRes.ok) {
                    return {
                        buffer: Buffer.from(await imgRes.arrayBuffer()),
                        contentType: imgRes.headers.get('content-type') || 'image/png'
                    };
                }
            }
        } catch (e) {
            // ignore 
        }
        return null;
    }

    private async fetchFromFinnhub(ticker: string): Promise<{ buffer: Buffer, contentType: string } | null> {
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) return null;

        try {
            const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`;
            const res = await this.fetchWithTimeout(url);
            if (!res.ok) return null;

            const data = await res.json();
            if (data?.logo) {
                const imgRes = await this.fetchWithTimeout(data.logo);
                if (imgRes.ok) {
                    return {
                        buffer: Buffer.from(await imgRes.arrayBuffer()),
                        contentType: imgRes.headers.get('content-type') || 'image/png'
                    };
                }
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    private async fetchFromDomain(ticker: string): Promise<{ buffer: Buffer, contentType: string } | null> {
        // Validation: Ticker must be valid
        if (!ticker || ticker.length > 10) return null;

        // Manual overrides for major companies where naive guessing fails
        const TICKER_DOMAIN_OVERRIDES: Record<string, string> = {
            'TSM': 'tsmc.com',
            'AVGO': 'broadcom.com',
            'ASML': 'asml.com',
            'META': 'meta.com',
            'GOOG': 'abc.xyz',
            'GOOGL': 'abc.xyz',
            'BRK.B': 'berkshirehathaway.com',
            'BRK.A': 'berkshirehathaway.com',
            'JPM': 'jpmorganchase.com',
            'V': 'visa.com',
            'JNJ': 'jnj.com',
            'WMT': 'walmart.com',
            'PG': 'pg.com',
            'MA': 'mastercard.com',
            'UNH': 'unitedhealthgroup.com',
            'HD': 'homedepot.com',
            'PEP': 'pepsico.com',
            'KO': 'coca-colacompany.com',
            'COST': 'costco.com',
            'TM': 'global.toyota',
            'NVO': 'novonordisk.com',
            'AZN': 'astrazeneca.com',
            'NVS': 'novartis.com',
            'BABA': 'alibabagroup.com',
            'AMD': 'amd.com',
            'NFLX': 'netflix.com',
            'INTc': 'intel.com',
            'QCOM': 'qualcomm.com',
            'IBM': 'ibm.com',
            'TXN': 'ti.com',
            'HON': 'honeywell.com',
            'AMGN': 'amgen.com',
            'SBUX': 'starbucks.com',
            'MDLZ': 'mondelezinternational.com',
            'LRCX': 'lamresearch.com',
            'ISRG': 'intuitive.com',
            'BKNG': 'bookingholdings.com',
            'VRTX': 'vrtx.com',
            'REGN': 'regeneron.com',
            'ADP': 'adp.com',
            'ADI': 'analog.com',
            'GILD': 'gilead.com',
            'PANW': 'paloaltonetworks.com',
            'SNPS': 'synopsys.com',
            'CDNS': 'cadence.com',
            'MELI': 'mercadolibre.com',
            'KLAC': 'kla.com',
            'CRWD': 'crowdstrike.com',
            'MAR': 'marriott.com',
            'CTAS': 'cintas.com',
            'CSX': 'csx.com',
            'WDAY': 'workday.com',
            'ROP': 'ropertech.com',
            'MNST': 'monsterbevcorp.com',
            'ORLY': 'oreillyauto.com',
            'PCAR': 'paccar.com',
            'AEP': 'aep.com',
            'LULU': 'lululemon.com',
            'TRV': 'travelers.com',
            'PAYX': 'paychex.com',
            'ODFL': 'odfl.com',
            'FAST': 'fastenal.com',
            'ROST': 'rossstores.com',
            'KDP': 'keurigdrpepper.com',
            'EA': 'ea.com',
            'EXC': 'exeloncorp.com',
            'XEL': 'xcelenergy.com',
            'VRSK': 'verisk.com',
            'BIIB': 'biogen.com',
            'DLTR': 'dollartree.com',
            'BKR': 'bakerhughes.com',
            'KHC': 'kraftheinzcompany.com',
            'EBAY': 'ebayinc.com',
            'WBD': 'wbd.com',
            'ILMN': 'illumina.com',
            'ALGN': 'aligntech.com',
            'TEAM': 'atlassian.com',
            'ENPH': 'enphase.com',
            'ZM': 'zoom.us',
            'LCID': 'lucidmotors.com',
            'SIRI': 'siriusxm.com',
            'RIVN': 'rivian.com',
            'ZS': 'zscaler.com',
            'TTD': 'thetradedesk.com',
            'MDB': 'mongodb.com',
            'DDOG': 'datadoghq.com',
            'ANSS': 'ansys.com',
            'SWKS': 'skyworksinc.com',
            'SPLK': 'splunk.com',
            'OKTA': 'okta.com',
            'DOCU': 'docusign.com',
            'NTAP': 'netapp.com',
            'SGEN': 'seagen.com',
            'CHKP': 'checkpoint.com',
            'VRSN': 'verisign.com',
            'FOXA': 'foxcorporation.com',
            'FOX': 'foxcorporation.com',
            'MTCH': 'match.com',
            'U': 'unity.com',
            'ZG': 'zillowgroup.com',
            'Z': 'zillowgroup.com',
            'PTON': 'onepeloton.com',
            'OPEN': 'opendoor.com',
            'RDFN': 'redfin.com',
            'HOOD': 'robinhood.com',
            'COIN': 'coinbase.com',
            'DKNG': 'draftkings.com',
            'ROKU': 'roku.com',
            'SQ': 'block.xyz',
            'T': 'att.com',
            'VZ': 'verizon.com',
            'CMCSA': 'comcastcorporation.com',
            'DIS': 'thewaltdisneycompany.com',
            'NKE': 'nike.com',
            'LOW': 'lowes.com',
            'MCD': 'mcdonalds.com',
            'UPS': 'ups.com',
            'UNP': 'up.com',
            'CAT': 'caterpillar.com',
            'BA': 'boeing.com',
            'MMM': '3m.com',
            'GE': 'ge.com',
            'CVX': 'chevron.com',
            'XOM': 'exxonmobil.com',
            'PFE': 'pfizer.com',
            'MRK': 'merck.com',
            'ABBV': 'abbvie.com',
            'BMY': 'bms.com',
            'LLY': 'lilly.com',
            'DHR': 'danaher.com',
            'TMO': 'thermofisher.com',
            'ABT': 'abbott.com',
            'MDT': 'medtronic.com',
            'CRM': 'salesforce.com',
            'ACN': 'accenture.com',
            'ORCL': 'oracle.com',
            'CSCO': 'cisco.com',
            'INTU': 'intuit.com',
            'NOW': 'servicenow.com'
        };

        // Naive domain guess
        const domain = TICKER_DOMAIN_OVERRIDES[ticker.toUpperCase()] || `${ticker.toLowerCase()}.com`;
        const sources = [
            `https://logo.clearbit.com/${domain}?size=128`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
        ];

        for (const url of sources) {
            try {
                const res = await this.fetchWithTimeout(url);
                if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
                    const buffer = Buffer.from(await res.arrayBuffer());
                    if (buffer.length > 500) {
                        return {
                            buffer,
                            contentType: res.headers.get('content-type') || 'image/png'
                        };
                    }
                }
            } catch { }
        }
        return null;
    }

    private async saveBufferToWebP(buffer: Buffer, ticker: string): Promise<string> {
        await fs.mkdir(LOGOS_DIR, { recursive: true });

        const size = 32;
        const filename = `${ticker.toLowerCase()}-${size}.webp`;
        const filepath = path.join(LOGOS_DIR, filename);

        // Also save 64px
        const filename64 = `${ticker.toLowerCase()}-64.webp`;
        const filepath64 = path.join(LOGOS_DIR, filename64);

        await sharp(buffer)
            .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .webp({ quality: 90 })
            .toFile(filepath);

        await sharp(buffer)
            .resize(64, 64, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .webp({ quality: 90 })
            .toFile(filepath64);

        return `/logos/${filename}`;
    }
}
