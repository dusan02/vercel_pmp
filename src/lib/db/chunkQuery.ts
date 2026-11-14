/**
 * Splits a parameter list into bounded chunks (default 150) before running a
 * Prisma query so SQLite's 999 bind-variable limit is never exceeded when
 * `IN (...)` is combined with inequality filters.
 */
export async function chunkQuery<T, K = string>(
  items: readonly K[],
  fn: (chunk: K[]) => Promise<T[]>,
  chunkSize = 150,
): Promise<T[]> {
  if (items.length === 0) return [];
  if (items.length <= chunkSize) return fn([...items]);
  const results: T[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const part = await fn(items.slice(i, i + chunkSize));
    results.push(...part);
  }
  return results;
}
