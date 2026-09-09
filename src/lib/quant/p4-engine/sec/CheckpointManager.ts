/**
 * CheckpointManager — atomic checkpoint/resume for bulk ingestion workers.
 *
 * Design principles:
 * 1. Checkpoint is written AFTER DB commit (never before) — ensures
 *    "checkpoint says DONE" implies "DB has data".
 * 2. On resume, completed units are skipped — no reprocessing.
 * 3. If crash happens between DB commit and checkpoint write, the unit
 *    will be reprocessed on resume — but since the loader is idempotent
 *    (deleteMany + re-insert), this is safe (just wasted work).
 * 4. Checkpoint file is written atomically (write to temp, rename) —
 *    prevents corruption from mid-write crash.
 *
 * Usage:
 *   const ckpt = new CheckpointManager('/path/to/.ingest-progress.json');
 *   await ckpt.load();
 *   for (const unit of units) {
 *     if (ckpt.isCompleted(unit.id)) { console.log('skip'); continue; }
 *     await processUnit(unit);  // DB commit happens here
 *     await ckpt.markCompleted(unit.id);  // checkpoint AFTER commit
 *   }
 *   await ckpt.clear();  // optional: clear after successful full run
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CheckpointState {
    workerId: string;
    startedAt: string;
    updatedAt: string;
    completed: string[];  // unit IDs (e.g., CIK strings)
    failed: { unitId: string; error: string; timestamp: string }[];
}

export class CheckpointManager {
    private readonly checkpointPath: string;
    private readonly tempPath: string;
    private state: CheckpointState;
    private completedSet: Set<string>;

    constructor(checkpointPath: string, workerId: string = 'default') {
        this.checkpointPath = checkpointPath;
        this.tempPath = checkpointPath + '.tmp';
        this.state = {
            workerId,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completed: [],
            failed: [],
        };
        this.completedSet = new Set();
    }

    /**
     * Load checkpoint from disk if it exists.
     * Returns true if a valid checkpoint was loaded.
     */
    async load(): Promise<boolean> {
        try {
            if (!fs.existsSync(this.checkpointPath)) {
                return false;
            }
            const raw = fs.readFileSync(this.checkpointPath, 'utf-8');
            const loaded = JSON.parse(raw) as CheckpointState;

            // Validate structure
            if (!loaded.workerId || !Array.isArray(loaded.completed)) {
                return false;
            }

            this.state = loaded;
            this.completedSet = new Set(loaded.completed);
            return true;
        } catch (e) {
            // Corrupted checkpoint — start fresh
            return false;
        }
    }

    /**
     * Check if a unit has been completed.
     */
    isCompleted(unitId: string): boolean {
        return this.completedSet.has(unitId);
    }

    /**
     * Mark a unit as completed. MUST be called AFTER the DB commit for that unit.
     * Writes the checkpoint atomically (temp file + rename).
     */
    async markCompleted(unitId: string): Promise<void> {
        this.completedSet.add(unitId);
        this.state.completed = Array.from(this.completedSet).sort();
        this.state.updatedAt = new Date().toISOString();
        await this.flush();
    }

    /**
     * Mark a unit as failed (non-fatal — allows resume to retry).
     */
    async markFailed(unitId: string, error: string): Promise<void> {
        this.state.failed.push({
            unitId,
            error: error.slice(0, 500),  // truncate long errors
            timestamp: new Date().toISOString(),
        });
        this.state.updatedAt = new Date().toISOString();
        await this.flush();
    }

    /**
     * Atomically write checkpoint to disk.
     * Uses temp file + rename to prevent corruption from mid-write crash.
     */
    private async flush(): Promise<void> {
        const json = JSON.stringify(this.state, null, 2);
        fs.writeFileSync(this.tempPath, json, 'utf-8');
        // Atomic rename on POSIX systems
        fs.renameSync(this.tempPath, this.checkpointPath);
    }

    /**
     * Clear checkpoint after successful full run.
     */
    async clear(): Promise<void> {
        try {
            if (fs.existsSync(this.checkpointPath)) {
                fs.unlinkSync(this.checkpointPath);
            }
            if (fs.existsSync(this.tempPath)) {
                fs.unlinkSync(this.tempPath);
            }
        } catch (e) {
            // ignore
        }
        this.completedSet.clear();
        this.state.completed = [];
        this.state.failed = [];
    }

    /**
     * Get summary stats.
     */
    getStats(): { completed: number; failed: number } {
        return {
            completed: this.completedSet.size,
            failed: this.state.failed.length,
        };
    }

    /**
     * Get list of completed unit IDs.
     */
    getCompleted(): string[] {
        return Array.from(this.completedSet).sort();
    }

    /**
     * Get list of failed units.
     */
    getFailed(): { unitId: string; error: string; timestamp: string }[] {
        return [...this.state.failed];
    }
}
