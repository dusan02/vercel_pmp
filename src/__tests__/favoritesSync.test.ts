/**
 * @jest-environment node
 *
 * Favorites sync race — logged-in user starring a ticker on the analysis
 * page saw the star un-fill because the login-sync GET overwrote local
 * state with a server snapshot that predated the click ("worked only on
 * second load"). mergeServerFavorites keeps edits that landed after the
 * sync baseline while still letting remote removals propagate.
 */
import { mergeServerFavorites } from '@/hooks/useUserPreferences';

describe('mergeServerFavorites', () => {
    it('applies the server list when local state matches the baseline', () => {
        expect(mergeServerFavorites(['AAPL', 'MSFT'], ['AAPL', 'MSFT'], ['AAPL', 'MSFT', 'NVDA']))
            .toEqual(['AAPL', 'MSFT', 'NVDA']);
    });

    it('keeps a star added while the sync GET was in flight (the bug)', () => {
        // base=[] captured at effect start; user clicked AAPL during the
        // fetch; server snapshot lacks it → must not wipe the click.
        expect(mergeServerFavorites(['AAPL'], [], ['TSLA']))
            .toEqual(['TSLA', 'AAPL']);
    });

    it('keeps a star removed while the sync GET was in flight', () => {
        // base=[A,B]; user removed B mid-flight; stale server still has B.
        expect(mergeServerFavorites(['A'], ['A', 'B'], ['A', 'B']))
            .toEqual(['A']);
    });

    it('propagates remote removals', () => {
        // B was removed on another device; local is untouched baseline.
        expect(mergeServerFavorites(['A', 'B'], ['A', 'B'], ['A']))
            .toEqual(['A']);
    });

    it('empty server response never wipes pending local adds', () => {
        expect(mergeServerFavorites(['X'], [], [])).toEqual(['X']);
    });

    it('is a no-op when nothing changed (stable reference semantics)', () => {
        expect(mergeServerFavorites(['A'], ['A'], ['A'])).toEqual(['A']);
    });
});
