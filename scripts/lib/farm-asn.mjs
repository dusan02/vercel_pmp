/**
 * Shared datacenter/farm ASN data.
 *
 * One curated ASN list drives two consumers:
 *   - gen-farm-nginx.mjs → nginx geo deny map on the VPS (edge 403)
 *   - human-filter.ts    → local datacenter classification (no ip-api 429s)
 *
 * Prefixes come from RIPEstat announced-prefixes (free, no key, generous
 * limits) and are cached at ~/.cache/pmp-farm-cidrs.json for 7 days.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Observed render-farm ASNs — pure cloud/hosting providers that real users
 * essentially never browse from. Extend carefully: residential ISPs
 * (RCN AS6079 etc.) must NEVER be added — that would block humans.
 */
export const FARM_ASNS = [
  45102,   // Alibaba (US) Technology Co.
  55990,   // Huawei Cloud (HWCLOUD)
  132203,  // Tencent (TENCENT-NET-AP-CN)
  136907,  // HUAWEI CLOUDS
  30058,   // FDCservers.net
  398781,  // OCULUS NETWORKS
  212238,  // Datacamp Limited (CDN77 ranges abused by bots)
];

const CACHE = path.join(os.homedir(), '.cache', 'pmp-farm-cidrs.json');
const TTL_MS = 7 * 86400_000;

async function fetchPrefixes(asn) {
  const url = `https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${asn}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`RIPEstat AS${asn}: HTTP ${r.status}`);
  const j = await r.json();
  return (j?.data?.prefixes ?? []).map((p) => p.prefix).filter((p) => p.includes('.')); // v4 only — farm traffic is IPv4
}

/** Fresh prefix list for all FARM_ASNS (no cache). */
export async function fetchFarmCidrs() {
  const out = [];
  for (const asn of FARM_ASNS) {
    try {
      const ps = await fetchPrefixes(asn);
      for (const p of ps) out.push({ cidr: p, asn });
      console.log(`AS${asn}: ${ps.length} v4 prefixes`);
    } catch (e) {
      console.error(`AS${asn} fetch failed: ${e.message}`);
    }
  }
  return out;
}

/** Cache-aware prefix list — 7-day TTL at ~/.cache/pmp-farm-cidrs.json. */
export async function getFarmCidrs({ refresh = false } = {}) {
  try {
    if (!refresh && fs.existsSync(CACHE)) {
      const st = fs.statSync(CACHE);
      if (Date.now() - st.mtimeMs < TTL_MS) {
        const j = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
        if (Array.isArray(j?.cidrs) && j.cidrs.length) return j.cidrs;
      }
    }
  } catch { /* fall through to fetch */ }
  const cidrs = await fetchFarmCidrs();
  try {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify({ asns: FARM_ASNS, cidrs, at: Date.now() }));
  } catch { /* cache write is best-effort */ }
  return cidrs;
}

// ---- IPv4-in-CIDR matching -------------------------------------------------

function ipToInt(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) { const b = Number(o); if (!(b >= 0 && b <= 255)) return null; n = n * 256 + b; }
  return n;
}

/** Build a sorted [start,end,asn] range table for fast lookups. */
export function buildFarmRanges(cidrs) {
  return cidrs
    .map(({ cidr, asn }) => {
      const [ip, bits] = cidr.split('/');
      const start = ipToInt(ip);
      const mask = bits == null ? 32 : Number(bits);
      if (start == null || !(mask >= 0 && mask <= 32)) return null;
      const size = 2 ** (32 - mask);
      return [start, start + size - 1, asn];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);
}

/** Returns the matching ASN if ip is inside a farm range, else null. */
export function asnOf(ip, ranges) {
  const n = ipToInt(ip);
  if (n == null) return null;
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e, asn] = ranges[mid];
    if (n < s) hi = mid - 1;
    else if (n > e) lo = mid + 1;
    else return asn;
  }
  return null;
}
