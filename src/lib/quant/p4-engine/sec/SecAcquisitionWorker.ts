import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface SecAcquisitionOptions {
    rawBaseDir?: string;
    userAgent?: string;
    minRequestIntervalMs?: number;
}

export interface SecArtifactManifestEntry {
    cik: string;
    artifactType: 'SUBMISSIONS' | 'COMPANYFACTS';
    url: string;
    fetchedAt: string;
    byteLength: number;
    artifactHash: string;
    filePath: string;
    status: 'FETCHED' | 'FAILED';
    errorMessage?: string;
}

export class SecAcquisitionWorker {
    private rawBaseDir: string;
    private userAgent: string;
    private minRequestIntervalMs: number;
    private manifestPath: string;
    private manifestCache: Map<string, SecArtifactManifestEntry> = new Map();
    
    // Concurrency-safe rate limit scheduling queue
    private rateLimitQueue: Promise<void> = Promise.resolve();
    private nextAvailableRequestTime: number = 0;

    // Concurrency-safe manifest mutation queue
    private manifestMutationQueue: Promise<void> = Promise.resolve();

    constructor(options: SecAcquisitionOptions = {}) {
        this.rawBaseDir = options.rawBaseDir || path.resolve(process.cwd(), 'src/lib/quant/data/raw/sec');
        this.userAgent = options.userAgent || 'PreMarketPrice quant@premarketprice.com';
        // SEC max is 10 req/s. We enforce min 120ms between requests (<= 8.3 req/s)
        this.minRequestIntervalMs = options.minRequestIntervalMs ?? 120;
        this.manifestPath = path.join(this.rawBaseDir, 'manifests', 'sec_manifest.json');

        this.ensureDirectories();
        this.loadManifest();
    }

    private ensureDirectories() {
        const dirs = [
            path.join(this.rawBaseDir, 'submissions'),
            path.join(this.rawBaseDir, 'companyfacts'),
            path.join(this.rawBaseDir, 'manifests')
        ];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    private loadManifest() {
        if (fs.existsSync(this.manifestPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
                if (Array.isArray(data)) {
                    for (const entry of data) {
                        const key = `${entry.cik}:${entry.artifactType}`;
                        this.manifestCache.set(key, entry);
                    }
                }
            } catch (err) {
                console.warn(`[SecAcquisitionWorker] Warning: could not parse manifest, initializing empty:`, err);
            }
        }
    }

    /**
     * Atomically and safely persists the manifest to disk.
     * Uses an internal mutation queue to serialize writes during high concurrency.
     */
    private async persistManifestEntry(entry: SecArtifactManifestEntry): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.manifestMutationQueue = this.manifestMutationQueue.then(() => {
                try {
                    const key = `${entry.cik}:${entry.artifactType}`;
                    this.manifestCache.set(key, entry);
                    const entries = Array.from(this.manifestCache.values());
                    const content = JSON.stringify(entries, null, 2);

                    // Atomic write via tmp file + renameSync
                    const tmpFile = `${this.manifestPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
                    fs.writeFileSync(tmpFile, content, 'utf-8');
                    fs.renameSync(tmpFile, this.manifestPath);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    /**
     * Strictly validates and pads CIK to 10 digits.
     * Rejects non-numeric, zero, negative, or > 10 digits.
     */
    public static normalizeCik(cik: string | number): string {
        const str = String(cik).trim().replace(/^CIK/i, '');
        if (!/^\d{1,10}$/.test(str)) {
            throw new Error(`Invalid CIK format: '${cik}'. CIK must be numeric and between 1 and 10 digits.`);
        }
        const num = parseInt(str, 10);
        if (num <= 0) {
            throw new Error(`Invalid CIK format: '${cik}'. CIK must be greater than zero.`);
        }
        return str.padStart(10, '0');
    }

    /**
     * Concurrency-safe rate limiter.
     * Serializes concurrent calls through a promise chain, guaranteeing that every
     * scheduled HTTP request is separated by at least minRequestIntervalMs.
     */
    public async rateLimitThrottle(): Promise<number> {
        return new Promise<number>((resolve) => {
            this.rateLimitQueue = this.rateLimitQueue.then(async () => {
                const now = Date.now();
                const scheduledTime = Math.max(now, this.nextAvailableRequestTime);
                this.nextAvailableRequestTime = scheduledTime + this.minRequestIntervalMs;
                const waitMs = scheduledTime - now;
                if (waitMs > 0) {
                    await new Promise((r) => setTimeout(r, waitMs));
                }
                const actualExecutionTime = Date.now();
                resolve(actualExecutionTime);
            });
        });
    }

    /**
     * Acquires SEC Submissions metadata JSON for a CIK.
     * Endpoint: https://data.sec.gov/submissions/CIK{10-digit-cik}.json
     */
    public async acquireSubmissions(cikInput: string | number, forceRefresh: boolean = false): Promise<{
        cik: string;
        artifactHash: string;
        filePath: string;
        rawContent: string;
    }> {
        const cik = SecAcquisitionWorker.normalizeCik(cikInput);
        const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
        const destDir = path.join(this.rawBaseDir, 'submissions');
        return this.acquireArtifact(cik, 'SUBMISSIONS', url, destDir, forceRefresh);
    }

    /**
     * Acquires SEC CompanyFacts XBRL JSON for a CIK.
     * Endpoint: https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit-cik}.json
     */
    public async acquireCompanyFacts(cikInput: string | number, forceRefresh: boolean = false): Promise<{
        cik: string;
        artifactHash: string;
        filePath: string;
        rawContent: string;
    }> {
        const cik = SecAcquisitionWorker.normalizeCik(cikInput);
        const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
        const destDir = path.join(this.rawBaseDir, 'companyfacts');
        return this.acquireArtifact(cik, 'COMPANYFACTS', url, destDir, forceRefresh);
    }

    public async acquireArtifact(
        cik: string,
        artifactType: 'SUBMISSIONS' | 'COMPANYFACTS',
        url: string,
        destDir: string,
        forceRefresh: boolean
    ): Promise<{
        cik: string;
        artifactHash: string;
        filePath: string;
        rawContent: string;
    }> {
        const manifestKey = `${cik}:${artifactType}`;
        const existing = this.manifestCache.get(manifestKey);

        if (!forceRefresh && existing && existing.status === 'FETCHED' && fs.existsSync(existing.filePath)) {
            const rawContent = fs.readFileSync(existing.filePath, 'utf-8');
            const verifyHash = crypto.createHash('sha256').update(rawContent).digest('hex');
            if (verifyHash === existing.artifactHash) {
                return {
                    cik,
                    artifactHash: existing.artifactHash,
                    filePath: existing.filePath,
                    rawContent
                };
            }
            console.warn(`[SecAcquisitionWorker] Hash mismatch on disk for ${manifestKey}, re-fetching...`);
        }

        await this.rateLimitThrottle();

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept-Encoding': 'gzip, deflate',
                    'Host': 'data.sec.gov'
                }
            });
        } catch (fetchErr: any) {
            await this.recordFailure(cik, artifactType, url, `Network fetch error: ${fetchErr.message}`);
            throw new Error(`[SecAcquisitionWorker] Network fetch error for ${url}: ${fetchErr.message}`);
        }

        if (!response.ok) {
            const errMsg = `HTTP ${response.status} ${response.statusText}`;
            await this.recordFailure(cik, artifactType, url, errMsg);
            throw new Error(`[SecAcquisitionWorker] Failed to acquire ${url}: ${errMsg}`);
        }

        const rawContent = await response.text();
        if (!rawContent || rawContent.trim().length === 0) {
            const errMsg = `Empty response body received from ${url}`;
            await this.recordFailure(cik, artifactType, url, errMsg);
            throw new Error(`[SecAcquisitionWorker] ${errMsg}`);
        }

        // Validate JSON syntax immediately - fail-closed
        try {
            JSON.parse(rawContent);
        } catch (parseErr: any) {
            const errMsg = `Malformed JSON payload received: ${parseErr.message}`;
            await this.recordFailure(cik, artifactType, url, errMsg);
            throw new Error(`[SecAcquisitionWorker] ${errMsg}`);
        }

        const artifactHash = crypto.createHash('sha256').update(rawContent).digest('hex');
        const filename = `CIK${cik}_${artifactType.toLowerCase()}_${artifactHash.slice(0, 16)}.json`;
        const filePath = path.join(destDir, filename);

        // Atomic write via temp file
        const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
        fs.writeFileSync(tmpPath, rawContent, 'utf-8');
        fs.renameSync(tmpPath, filePath);

        const entry: SecArtifactManifestEntry = {
            cik,
            artifactType,
            url,
            fetchedAt: new Date().toISOString(),
            byteLength: Buffer.byteLength(rawContent, 'utf-8'),
            artifactHash,
            filePath,
            status: 'FETCHED'
        };

        await this.persistManifestEntry(entry);

        return {
            cik,
            artifactHash,
            filePath,
            rawContent
        };
    }

    private async recordFailure(cik: string, artifactType: 'SUBMISSIONS' | 'COMPANYFACTS', url: string, errorMessage: string) {
        const entry: SecArtifactManifestEntry = {
            cik,
            artifactType,
            url,
            fetchedAt: new Date().toISOString(),
            byteLength: 0,
            artifactHash: '',
            filePath: '',
            status: 'FAILED',
            errorMessage
        };
        await this.persistManifestEntry(entry);
    }

    public getManifestEntry(cikInput: string | number, artifactType: 'SUBMISSIONS' | 'COMPANYFACTS'): SecArtifactManifestEntry | undefined {
        const cik = SecAcquisitionWorker.normalizeCik(cikInput);
        return this.manifestCache.get(`${cik}:${artifactType}`);
    }
}
