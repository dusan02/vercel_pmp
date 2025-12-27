# Test Plan: Method B/B2 Fallback with Mocked Polygon API

## Test Cases

### Case 1: Polygon returns null/undefined for sharesOutstanding
- **Setup**: Mock Polygon API to return `{ results: { weighted_shares_outstanding: null } }`
- **Expected**: Method B or B2 activates, marketCapDiff calculated, persisted to DB
- **Assert**: `lastMarketCapDiff` in DB is not 0, log shows `Method B` or `Method B2` with reason

### Case 2: Polygon throws error/timeout
- **Setup**: Mock Polygon API to throw error or timeout
- **Expected**: Fallback activates (Method B/B2), DB persist succeeds, response doesn't crash
- **Assert**: Response returns successfully, `lastMarketCapDiff` calculated, log shows `reason=polygon error`

### Case 3: All fallbacks fail
- **Setup**: Polygon error + no marketCap + no previousClose
- **Expected**: System returns response (no crash), `marketCapDiff=0`, log shows `WARN:` (not `ERROR:`)
- **Assert**: Response status 200, `marketCapDiff=0`, no unhandled exceptions

## Implementation Notes

To implement these tests, you'll need to:
1. Mock `getSharesOutstanding` function in test environment
2. Use a test database or transaction rollback
3. Verify logs contain guard log messages with `sharesSource` and `reason` fields

## Manual Test Script

See `TEST_METHOD_B_MANUAL.txt` for a manual test that simulates missing sharesOutstanding.

