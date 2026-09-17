/**
 * IndexNow — instant URL submission to Bing/Yandex/Naver/Seznam.
 * Key file is served at /{INDEXNOW_KEY}.txt (public/).
 * Docs: https://www.indexnow.org/documentation
 */

export const INDEXNOW_KEY = '77aa565ca37347a9baef3bead82d5734';
const HOST = 'premarketprice.com';
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;

export interface IndexNowResult {
  ok: boolean;
  status: number;
  submitted: number;
}

/**
 * Submit URLs for immediate indexing. Bing processes them within minutes —
 * critical for dated archive pages that rank for same-day date queries.
 * No-op-safe: returns ok=false on network errors, never throws.
 */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const unique = [...new Set(urls)].filter((u) => u.startsWith(`https://${HOST}`));
  if (unique.length === 0) return { ok: true, status: 0, submitted: 0 };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: KEY_LOCATION,
        urlList: unique.slice(0, 10000),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, status: res.status, submitted: unique.length };
  } catch (err) {
    console.error('[IndexNow] submission failed:', err);
    return { ok: false, status: -1, submitted: 0 };
  }
}
