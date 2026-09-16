import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for the Sep 2026 incident: PM2 cron apps died silently
 * because ecosystem.config referenced scripts that only existed in unpushed
 * VPS commits. Every script path in the config must exist in the repo.
 */
describe('ecosystem.config.cjs', () => {
  const configPath = path.join(process.cwd(), 'ecosystem.config.cjs');
  const content = fs.readFileSync(configPath, 'utf8');
  const scripts = [...content.matchAll(/script:\s*"([^"]+)"/g)].map(m => m[1]);

  it('every referenced script file exists', () => {
    const missing = scripts.filter(s => !fs.existsSync(path.join(process.cwd(), s)));
    expect(missing).toEqual([]);
  });

  it('post-market-daily-reset runs after 16:00 ET in both DST seasons', () => {
    // Server TZ is Europe/Prague. 22:20 Prague = 16:20 ET during CEST
    // (UTC+2) and CET (UTC+1) alike — safely after the 16:00 ET close and
    // after Polygon Starter's ~15min delay settles.
    const block = content.match(/name:\s*"post-market-daily-reset"[\s\S]*?cron_restart:\s*"([^"]+)"/);
    expect(block).not.toBeNull();
    expect(block![1]).toBe('20 22 * * *');
  });
});
