/**
 * Server-side operational log that survives `compiler.removeConsole`.
 *
 * Next's SWC compiler strips every console.* call except error/warn from
 * bundled app code — that's why route/cron logs (post-market-reset etc.)
 * silently disappeared from the pm2 out log after 2026-09-15. Writing to
 * stdout directly is not stripped and works identically under tsx
 * (workers/scripts) and the Next server runtime.
 *
 * Server-only — do not import from client components.
 */
export function serverLog(...args: unknown[]): void {
  if (typeof process === 'undefined' || !process.stdout) return;
  const line = args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  process.stdout.write(line + '\n');
}
