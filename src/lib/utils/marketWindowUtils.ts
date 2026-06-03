/**
 * Market window helpers — pure functions, no external dependencies.
 * Extracted here so they can be unit-tested without importing the full worker.
 */

/**
 * Returns true when the current ET time falls inside the
 * bulk-preload / stale-alert window: 07:30–15:55 ET.
 *
 * Bug fix vs. previous inline version: `hours >= 7` incorrectly
 * included 07:00–07:29. Correct check is `hours > 7 || (hours === 7 && minutes >= 30)`.
 */
export function isBulkPreloadWindow(hours: number, minutes: number): boolean {
  return (
    (hours > 7 && hours < 15) ||
    (hours === 7 && minutes >= 30) ||
    (hours === 15 && minutes < 55)
  );
}
