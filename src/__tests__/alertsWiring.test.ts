/**
 * Alerts wiring invariants (source-grep guard, same pattern as
 * moversParity.test.ts):
 *
 *   1. The alert trigger MUST live in the Polygon ingest worker
 *      (write path, single process) — never in getMoversData,
 *      which is a read path called concurrently by page requests
 *      and the polled /api/stocks/movers endpoint.
 *   2. The trigger MUST be gated on a real price write
 *      (priceUpdated) so weekend-frozen / stale ingests can't alert.
 *   3. The trigger MUST be fire-and-forget — alerting must never
 *      block or break the ingest loop.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const INGEST = join(__dirname, '../workers/polygon/ingestBatch.ts');
const MOVERS_READ = join(__dirname, '../services/movers/getMovers.ts');
const MOVERS_API = join(__dirname, '../app/api/stocks/movers/route.ts');

const PUSH_SIDE_EFFECTS = ['notifyTrackedMove', 'webpush', 'sendNotification', 'maybeNotifyTrackedMove'];

describe('alerts wiring invariants', () => {
    const ingestSrc = readFileSync(INGEST, 'utf8');
    const moversSrc = readFileSync(MOVERS_READ, 'utf8');
    const apiSrc = readFileSync(MOVERS_API, 'utf8');

    it('alert trigger lives in the Polygon ingest worker', () => {
        expect(ingestSrc).toContain('maybeNotifyTrackedMove');
    });

    it('trigger is gated on a real price write (priceUpdated)', () => {
        expect(ingestSrc).toMatch(/priceUpdated/);
        expect(ingestSrc).toMatch(/dbSuccess\s*&&\s*priceUpdated/);
    });

    it('trigger is fire-and-forget — does not await inside ingest', () => {
        expect(ingestSrc).toMatch(/void\s+maybeNotifyTrackedMove\(/);
    });

    it('getMoversData read path has NO push side-effects', () => {
        for (const sym of PUSH_SIDE_EFFECTS) {
            expect(moversSrc).not.toContain(sym);
        }
    });

    it('/api/stocks/movers read path has NO push side-effects', () => {
        for (const sym of PUSH_SIDE_EFFECTS) {
            expect(apiSrc).not.toContain(sym);
        }
    });
});
