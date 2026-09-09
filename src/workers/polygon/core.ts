/**
 * Barrel re-export for backwards compatibility.
 *
 * Originally a 679-line monolith, now split into:
 * - snapshotFetcher.ts: fetchPolygonSnapshot, calculateExpectedVolume
 * - snapshotNormalizer.ts: normalizeSnapshot
 * - dbUpsert.ts: upsertToDB
 */

export { fetchPolygonSnapshot, calculateExpectedVolume } from './snapshotFetcher';
export { normalizeSnapshot } from './snapshotNormalizer';
export type { NormalizedSnapshot } from './snapshotNormalizer';
export { upsertToDB } from './dbUpsert';
