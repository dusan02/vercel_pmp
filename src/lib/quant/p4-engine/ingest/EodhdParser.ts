import * as crypto from 'crypto';

export interface ParsedPriceFact {
    tradeDate: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
    sourceRecordHash: string;
}

export class EodhdParser {
    public parse(
        securityId: string, 
        rawPayload: string, 
        artifactHash: string,
        sourceType: string = 'EODHD_BULK_V1'
    ): ParsedPriceFact[] {
        if (!rawPayload.trim()) throw new Error("Empty payload");
        
        const data = JSON.parse(rawPayload);
        if (!Array.isArray(data)) throw new Error("EODHD payload must be an array");
        if (data.length === 0) throw new Error("EODHD payload array is empty");

        let lastDateMs = -1;
        const seenDates = new Set<string>();

        return data.map((row: any, index: number) => {
            if (!row.date || typeof row.date !== 'string') throw new Error(`Row ${index}: Invalid date`);
            if (seenDates.has(row.date)) throw new Error(`Row ${index}: Duplicate tradeDate ${row.date}`);
            seenDates.add(row.date);

            const tradeDate = new Date(row.date);
            const tMs = tradeDate.getTime();
            if (isNaN(tMs)) throw new Error(`Row ${index}: Invalid date format`);
            
            // Check non-monotonic dates (EODHD should be strictly ascending or descending, usually ascending. We enforce ascending for parsing simplicity or sort it? Wait, let's just enforce sorting externally or allow it but check uniqueness).
            // Actually, just ensuring no duplicates is primary.

            const reqNum = ['open', 'high', 'low', 'close', 'volume'];
            for (const field of reqNum) {
                if (typeof row[field] !== 'number' || !isFinite(row[field])) {
                    throw new Error(`Row ${index}: Missing, malformed, or NaN/Infinity numeric field '${field}'`);
                }
            }

            if (row.volume < 0) throw new Error(`Row ${index}: Negative volume`);
            if (row.low > row.high) throw new Error(`Row ${index}: Low > High`);
            if (row.open < 0 || row.close < 0) throw new Error(`Row ${index}: Negative price`);

            const canonicalString = `${artifactHash}|${sourceType}|${securityId}|${row.date}|${row.open.toFixed(4)}|${row.high.toFixed(4)}|${row.low.toFixed(4)}|${row.close.toFixed(4)}|${row.volume}`;
            const hash = crypto.createHash('sha256').update(canonicalString).digest('hex');

            return {
                tradeDate,
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                volume: BigInt(Math.floor(row.volume)),
                sourceRecordHash: hash
            };
        }).sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime()); // Enforce chronological order
    }
}
