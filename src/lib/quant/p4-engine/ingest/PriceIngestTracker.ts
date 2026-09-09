import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type IngestStatus = 'PENDING' | 'FETCHED' | 'INGESTED' | 'ERROR';

export interface CheckpointRecord {
    id: string; // securityId:dateRange
    securityId: string;
    sourceSymbol: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    artifactHash: string | null;
    status: IngestStatus;
    errorMsg?: string;
    updatedAt: string;
}

export class PriceIngestTracker {
    private rawDir: string;
    private checkpointFile: string;
    private state: Map<string, CheckpointRecord>;

    constructor(baseDir: string = path.join(process.cwd(), 'src/lib/quant/data')) {
        this.rawDir = path.join(baseDir, 'raw', 'eodhd');
        const stateDir = path.join(baseDir, 'processed', 'state');
        
        if (!fs.existsSync(this.rawDir)) fs.mkdirSync(this.rawDir, { recursive: true });
        if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
        
        this.checkpointFile = path.join(stateDir, 'price_ingest_checkpoints.json');
        this.state = new Map();
        this.loadState();
    }

    private loadState() {
        if (fs.existsSync(this.checkpointFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf-8'));
                for (const k of Object.keys(data)) {
                    this.state.set(k, data[k]);
                }
            } catch (e) {
                console.error("Failed to load checkpoint file", e);
            }
        }
    }

    private saveState() {
        const obj = Object.fromEntries(this.state);
        fs.writeFileSync(this.checkpointFile, JSON.stringify(obj, null, 2));
    }
    
    public getCheckpoint(id: string): CheckpointRecord | undefined {
        return this.state.get(id);
    }

    public updateCheckpoint(record: CheckpointRecord) {
        record.updatedAt = new Date().toISOString();
        this.state.set(record.id, record);
        this.saveState();
    }

    public saveRawArtifact(
        sourceSymbol: string, 
        endpoint: string, 
        params: any, 
        data: any
    ): { filePath: string, hash: string, rowCount: number } {
        const symbolDir = path.join(this.rawDir, sourceSymbol.replace(/[^a-zA-Z0-9.-]/g, ''));
        if (!fs.existsSync(symbolDir)) fs.mkdirSync(symbolDir, { recursive: true });
        
        const timestamp = new Date().toISOString();
        const contentStr = JSON.stringify(data, null, 2);
        const hash = crypto.createHash('sha256').update(contentStr).digest('hex');
        const filename = `${sourceSymbol}_${hash.substring(0,8)}.json`;
        const filePath = path.join(symbolDir, filename);
        
        fs.writeFileSync(filePath, contentStr);
        
        const rowCount = Array.isArray(data) ? data.length : 0;
        
        const manifest = {
            file: filename,
            sha256: hash,
            timestamp,
            endpoint,
            params,
            rowCount
        };
        
        fs.writeFileSync(path.join(symbolDir, `${filename}.manifest.json`), JSON.stringify(manifest, null, 2));
        
        return { filePath, hash, rowCount };
    }
}
