/**
 * Early Winners / V5-C — Project Status CLI
 * ==========================================
 *
 * Prints the definitive project status: what is implemented, frozen,
 * validated — and what is NOT (historical PIT data, V5-C OOS result).
 *
 * Usage:
 *   npm run quant:status          (human-readable)
 *   npm run quant:status -- --json
 */

import { pathToFileURL } from 'node:url';
import { buildProjectStatus, formatProjectStatus } from './project-status';

function main(): void {
  const args = process.argv.slice(2);
  const status = buildProjectStatus();
  if (args.includes('--json')) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(formatProjectStatus(status));
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
