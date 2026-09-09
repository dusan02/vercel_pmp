import * as fs from 'fs';
import * as crypto from 'crypto';
import { LedgerEvent } from './persistence-types';

export interface WalEntry {
    sequence: number;
    eventId: string;
    checksum: string;
    payload: LedgerEvent;
}

export class FileWAL {
    private sequence = 0;
    private fd: number;
    
    constructor(private filePath: string) {
        this.fd = fs.openSync(this.filePath, 'a+');
        this.recoverSequence();
    }
    
    private recoverSequence() {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Scan backwards to find the last fully valid record
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
                const entry = JSON.parse(line) as WalEntry;
                const expectedChecksum = crypto.createHash('sha256').update(JSON.stringify(entry.payload)).digest('hex');
                if (entry.checksum === expectedChecksum && entry.sequence > 0) {
                    this.sequence = entry.sequence;
                    return;
                }
            } catch (e) {
                // If JSON is invalid, keep scanning backwards until we find a valid one.
            }
        }
        this.sequence = 0;
    }

    public append(event: LedgerEvent): void {
        this.sequence++;
        const eventId = crypto.randomUUID();
        const payloadStr = JSON.stringify(event);
        const checksum = crypto.createHash('sha256').update(payloadStr).digest('hex');
        
        const entry: WalEntry = {
            sequence: this.sequence,
            eventId,
            checksum,
            payload: event
        };
        
        const line = JSON.stringify(entry) + '\n';
        fs.writeSync(this.fd, line);
        fs.fsyncSync(this.fd);
    }
    
    public readAll(): LedgerEvent[] {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const lines = content.split('\n');
        const events: LedgerEvent[] = [];
        let expectedSeq = 1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const entry = JSON.parse(line) as WalEntry;
                if (entry.sequence !== expectedSeq) throw new Error(`WAL Sequence Gap: Expected ${expectedSeq}, found ${entry.sequence}`);
                const expectedChecksum = crypto.createHash('sha256').update(JSON.stringify(entry.payload)).digest('hex');
                if (entry.checksum !== expectedChecksum) throw new Error(`WAL Checksum mismatch`);
                
                events.push(entry.payload);
                expectedSeq++;
            } catch (e: any) {
                // Determine if this is a truncated tail or middle corruption
                let isMiddleCorruption = false;
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim() !== '') {
                        isMiddleCorruption = true;
                        break;
                    }
                }
                
                if (isMiddleCorruption) {
                    throw new Error(`WAL FATAL CORRUPTION: Invalid record found at line ${i+1} with subsequent data present. Original Error: ${e.message}`);
                } else {
                    console.warn(`WAL Warning: Safely ignored truncated tail at EOF.`);
                    break;
                }
            }
        }
        return events;
    }
    
    public close() {
        fs.closeSync(this.fd);
    }
}
