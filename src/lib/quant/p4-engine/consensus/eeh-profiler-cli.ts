/**
 * Vendor Extract Profiler — CLI
 * ==============================
 *
 * Read-only profiler for a raw vendor CSV extract (e.g. a Nasdaq EEH
 * trial extract). Produces a machine-readable JSON profile + a
 * human-readable summary. This is the FIRST step on sample arrival:
 *
 *   raw CSV → profile → human verification → PIT interpretation → adapter
 *
 * Usage:
 *   tsx src/lib/quant/p4-engine/consensus/eeh-profiler-cli.ts <extract.csv> [options]
 *
 * Options:
 *   --universe <manifest.json>   frozen V5-B universe manifest for overlap
 *                                + OOS coverage checks
 *   --out <profile.json>         write JSON profile to file (else stdout summary only)
 *   --json                       print JSON profile to stdout instead of summary
 *
 * Guarantees: read-only, deterministic, no DB access, no EW logic.
 */

import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { profileEehRecords, formatProfileSummary } from './eeh-profiler';
import { UniverseManifest } from './universe-manifest';

// ─── Minimal deterministic CSV parser ──────────────────────────────────────
// RFC-4180-ish: quoted fields, embedded commas/quotes/newlines.
// Local copy — no external dep assumptions in the quant module.

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cur.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.length > 1 || cur[0] !== '') { rows.push(cur); }
      cur = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length === 0) return [];

  const headers = rows[0]!.map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const csvPath = args.find(a => !a.startsWith('--'));
  if (!csvPath) {
    console.error('Usage: tsx eeh-profiler-cli.ts <extract.csv> [--universe manifest.json] [--out profile.json] [--json]');
    process.exit(2);
  }

  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const text = fs.readFileSync(csvPath, 'utf-8');
  const records = parseCsv(text);

  let universe: UniverseManifest | undefined;
  const universePath = opt('--universe');
  if (universePath) {
    universe = JSON.parse(fs.readFileSync(universePath, 'utf-8')) as UniverseManifest;
  }

  const profile = profileEehRecords(records, universe ? { universe } : {});
  const summary = formatProfileSummary(profile);

  const out = opt('--out');
  if (out) fs.writeFileSync(out, JSON.stringify(profile, null, 2) + '\n');

  if (args.includes('--json')) {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    console.log(summary);
    if (out) console.log(`\nJSON profile written: ${out}`);
  }
}

// Run only when invoked directly (importing this module for parseCsv must not execute the CLI)
const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
