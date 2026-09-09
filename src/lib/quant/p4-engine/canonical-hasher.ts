import crypto from 'crypto';

export class CanonicalHasher {
    
    public static hashDataset(records: any[], primaryKeys: string[]): string {
        // 1. Sort records by primary keys to guarantee order independence
        const sortedRecords = [...records].sort((a, b) => {
            for (const key of primaryKeys) {
                const valA = a[key];
                const valB = b[key];
                if (valA < valB) return -1;
                if (valA > valB) return 1;
            }
            return 0;
        });

        // 2. Deterministic JSON Serialization (sort object keys)
        const deterministicStringify = (obj: any): string => {
            if (obj === null || typeof obj !== 'object') {
                return JSON.stringify(obj);
            }
            if (Array.isArray(obj)) {
                return `[${obj.map(deterministicStringify).join(',')}]`;
            }
            const keys = Object.keys(obj).sort();
            const keyVals = keys.map(k => `"${k}":${deterministicStringify(obj[k])}`);
            return `{${keyVals.join(',')}}`;
        };

        const serialized = deterministicStringify(sortedRecords);
        
        // 3. SHA-256
        return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
    }
}
