import fs from 'fs';
import path from 'path';

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};

  contents.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    // strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) out[key] = value;
  });

  return out;
}

/**
 * Load env vars from `.env` then `.env.local` (if present) without relying on `dotenv`.
 * - `.env.local` overrides `.env`
 * - Does not overwrite already-present `process.env` keys
 */
export function loadEnvFromFiles(cwd: string = process.cwd()): void {
  const envPath = path.resolve(cwd, '.env');
  const envLocalPath = path.resolve(cwd, '.env.local');

  const apply = (vars: Record<string, string>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined) {
        process.env[k] = v;
      }
    }
  };

  try {
    if (fs.existsSync(envPath)) {
      apply(parseEnvFile(fs.readFileSync(envPath, 'utf8')));
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(envLocalPath)) {
      // `.env.local` should override `.env` where not already set by actual env vars
      apply(parseEnvFile(fs.readFileSync(envLocalPath, 'utf8')));
    }
  } catch {
    // ignore
  }
}

