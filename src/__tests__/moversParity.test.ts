/**
 * Movers surface-parity guard.
 *
 * /premarket-movers (SSR SEO page) and /api/stocks/movers (homepage
 * MoversSection data source) MUST both consume the shared Movers 2.0
 * pipeline in src/services/movers/getMovers.ts — the calculation layer
 * in src/services/movers/ stays canonical and is never duplicated.
 *
 * If a second mover pipeline (e.g. the old Redis-rank table) is ever
 * reintroduced on either surface, this test fails.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const API_ROUTE = join(__dirname, '../app/api/stocks/movers/route.ts');
const SSR_PAGE = join(__dirname, '../app/premarket-movers/page.tsx');
const ZH_PAGE = join(__dirname, '../app/zh/premarket-movers/page.tsx');

const SHARED_SERVICE = "@/services/movers/getMovers";
// Old pipeline pieces that must not reappear on the SSR page.
const OLD_PIPELINE = ['getRankedSymbols', 'getManyLastWithDate', 'mapToRedisSession'];
// Infra jargon that must never reach user-facing UI.
const JARGON = ['Redis', 'rank index', 'warming up', 'pmp-polygon-worker', 'worker'];

describe('movers surface parity', () => {
    const routeSrc = readFileSync(API_ROUTE, 'utf8');
    const pageSrc = readFileSync(SSR_PAGE, 'utf8');

    it('API route delegates to the shared getMoversData pipeline', () => {
        expect(routeSrc).toContain(SHARED_SERVICE);
        expect(routeSrc).toMatch(/getMoversData\(/);
    });

    it('SSR /premarket-movers page uses the same shared pipeline', () => {
        expect(pageSrc).toContain(SHARED_SERVICE);
        expect(pageSrc).toMatch(/getMoversData\(|getMovers\(/);
    });

    it('SSR page does not reintroduce the old Redis-rank mover pipeline', () => {
        for (const sym of OLD_PIPELINE) {
            expect(pageSrc).not.toContain(sym);
        }
    });

    it('zh /premarket-movers variant uses the same shared pipeline', () => {
        const zhSrc = readFileSync(ZH_PAGE, 'utf8');
        expect(zhSrc).toContain(SHARED_SERVICE);
        for (const sym of OLD_PIPELINE) {
            expect(zhSrc).not.toContain(sym);
        }
    });

    it('user-facing surfaces contain no infrastructure jargon', () => {
        // Strip comments — only rendered/user-visible text matters.
        const rendered = pageSrc
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '');
        for (const term of JARGON) {
            expect(rendered.toLowerCase()).not.toContain(term.toLowerCase());
        }
    });

    it('SSR page distinguishes unavailable data from a genuine empty result', () => {
        // Separate messages for the three states — an error path must not
        // collapse into the no-movers message.
        expect(pageSrc).toContain('temporarily unavailable');
        expect(pageSrc).toContain('No unusual movers');
        expect(pageSrc).toContain('during market sessions');
    });
});
