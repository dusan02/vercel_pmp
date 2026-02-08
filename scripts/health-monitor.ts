/**
 * PM2 Cron Health Monitor
 *
 * Checks local health endpoints and optionally sends a webhook alert if the app is degraded/unhealthy.
 *
 * Env:
 * - BASE_URL: default http://127.0.0.1:3000
 * - ALERT_WEBHOOK_URL: optional (Discord/Slack/etc.)
 * - HEALTH_ALERT_COOLDOWN_MIN: default 10
 */

import fs from 'fs';
import path from 'path';

type HealthResponse = {
  status?: 'healthy' | 'degraded' | 'unhealthy';
  timestamp?: string;
  checks?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const WEBHOOK_URL = (process.env.ALERT_WEBHOOK_URL || '').trim();
const COOLDOWN_MIN = Number(process.env.HEALTH_ALERT_COOLDOWN_MIN || '10') || 10;

const COOLDOWN_FILE = path.join('/tmp', 'pmp_health_alert_last_ts');

function nowMs() {
  return Date.now();
}

function readLastAlertTs(): number | null {
  try {
    const raw = fs.readFileSync(COOLDOWN_FILE, 'utf8').trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastAlertTs(ts: number) {
  try {
    fs.writeFileSync(COOLDOWN_FILE, String(ts), 'utf8');
  } catch {
    // ignore
  }
}

type FetchJsonResult = {
  ok: boolean;
  status: number;
  json: any | null;
  error?: string;
};

async function fetchJson(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<FetchJsonResult> {
  const timeoutMs = opts?.timeoutMs ?? 2500;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: ctrl.signal,
    });

    let j: any = null;
    try {
      j = await res.json();
    } catch {
      // ignore
    }

    return { ok: res.ok, status: res.status, json: j };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const cause = (err as any)?.cause;
    const causeStr =
      cause && typeof cause === 'object'
        ? JSON.stringify(
            {
              // common undici fields
              code: (cause as any).code,
              errno: (cause as any).errno,
              syscall: (cause as any).syscall,
              address: (cause as any).address,
              port: (cause as any).port,
              message: (cause as any).message,
            },
            null,
            0
          )
        : cause
          ? String(cause)
          : '';

    return {
      ok: false,
      status: 0,
      json: null,
      error: causeStr ? `${err.message} | cause=${causeStr}` : err.message,
    };
  } finally {
    clearTimeout(t);
  }
}

async function sendWebhook(message: string) {
  if (!WEBHOOK_URL) return;
  // Try to be compatible with Slack + Discord (best-effort).
  const payload = { text: message, content: message };
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const started = nowMs();

  // IMPORTANT:
  // - /api/health is a strict "canary" and can return 503 for degraded subsystems.
  // - /api/healthz is a simpler uptime check (200 when DB is OK).
  // For uptime monitoring/alerting we use /api/healthz to avoid false incidents.
  const healthUrl = `${BASE_URL}/api/healthz`;
  const canaryUrl = `${BASE_URL}/api/health`;
  const workerUrl = `${BASE_URL}/api/health/worker`;
  const redisUrl = `${BASE_URL}/api/health/redis`;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let details: string[] = [];

  try {
    const [health, worker, redis, canary] = await Promise.all([
      fetchJson(healthUrl, { timeoutMs: 2500 }),
      fetchJson(workerUrl, { timeoutMs: 2500 }),
      fetchJson(redisUrl, { timeoutMs: 2500 }),
      fetchJson(canaryUrl, { timeoutMs: 2500 }),
    ]);

    const healthStatus = (health.json as HealthResponse | null)?.status;
    const workerStatus = (worker.json as HealthResponse | null)?.status;
    const redisStatus = (redis.json as HealthResponse | null)?.status;
    const canaryStatus =
      (canary.json as any)?.canary?.status ?? (canary.json as HealthResponse | null)?.status;

    const statuses = [healthStatus, workerStatus, redisStatus].filter(Boolean) as Array<'healthy' | 'degraded' | 'unhealthy'>;

    if (health.error) details.push(`healthzErr:${health.error}`);
    if (health.ok === false) {
      status = 'unhealthy';
      details.push(`healthz:${health.status}`);
    }
    if (worker.error) details.push(`workerErr:${worker.error}`);
    if (worker.ok === false) {
      status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
      details.push(`worker:${worker.status}`);
    }
    if (redis.error) details.push(`redisErr:${redis.error}`);
    if (redis.ok === false) {
      status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
      details.push(`redis:${redis.status}`);
    }

    // If endpoints responded but report degraded/unhealthy, treat as incident.
    if (statuses.includes('unhealthy')) status = 'unhealthy';
    else if (statuses.includes('degraded')) status = status === 'unhealthy' ? 'unhealthy' : 'degraded';

    // Canary health is informative only (do not mark unhealthy based on it alone).
    if (canary.error) details.push(`canaryErr:${canary.error}`);
    if (canary.ok === false) {
      details.push(`canary:${canary.status}`);
      status = status === 'healthy' ? 'degraded' : status;
    } else if (typeof canaryStatus === 'string' && canaryStatus !== 'healthy') {
      details.push(`canary:${canaryStatus}`);
      status = status === 'healthy' ? 'degraded' : status;
    }

    // Add quick human hints
    const workerAge = worker.json?.worker?.ageMinutes;
    if (typeof workerAge === 'number') details.push(`workerAgeMin:${workerAge}`);
    const p99 = worker.json?.freshness?.agePercentiles?.p99;
    if (typeof p99 === 'number') details.push(`freshnessP99Min:${p99.toFixed(1)}`);
  } catch (e) {
    status = 'unhealthy';
    details.push(`exception:${e instanceof Error ? e.message : String(e)}`);
  }

  const durationMs = nowMs() - started;

  if (status === 'healthy') {
    console.log(`✅ Health monitor OK (${durationMs}ms)`);
    return;
  }

  const msg = `🚨 PremarketPrice health: ${status.toUpperCase()} | ${details.join(' | ')} | base=${BASE_URL}`;
  console.error(msg);

  const last = readLastAlertTs();
  const canAlert = !last || (nowMs() - last) > COOLDOWN_MIN * 60_000;
  if (!canAlert) return;

  try {
    await sendWebhook(msg);
    writeLastAlertTs(nowMs());
  } catch (e) {
    console.error('Failed to send webhook alert:', e);
  }
}

main().catch((e) => {
  console.error('Health monitor fatal error:', e);
  process.exitCode = 1;
});

