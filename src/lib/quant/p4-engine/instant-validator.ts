import { Instant } from './temporal-types.js';

export class InstantValidator {
    /**
     * P4.2-H: Runtime Instant Hardening.
     * Strictly enforces canonical ISO-8601 UTC strings terminating with 'Z'.
     */
    static assertCanonical(instant: any): void {
        if (typeof instant !== 'string') {
            throw new Error(`HARD FAIL: Instant must be a string, got ${typeof instant}`);
        }
        
        // Strict UTC Canonical Regex: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ
        const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
        if (!regex.test(instant)) {
            throw new Error(`HARD FAIL: Malformed or non-canonical Instant. Must be ISO-8601 UTC terminating in 'Z'. Got: ${instant}`);
        }

        const d = new Date(instant);
        if (isNaN(d.getTime())) {
            throw new Error(`HARD FAIL: Invalid calendar date value in Instant. Got: ${instant}`);
        }
    }
}
