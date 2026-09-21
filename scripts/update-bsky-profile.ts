/**
 * One-off: update Bluesky profile (displayName + description) via AT Protocol.
 * Usage: npx tsx scripts/update-bsky-profile.ts
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

const PDS = 'https://bsky.social';
const DISPLAY_NAME = 'PreMarketPrice';
const DESCRIPTION =
  'Automated premarket movers, unusual volume alerts & fundamental stock analysis. 📈 premarketprice.com';

async function main() {
  const sessRes = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_APP_PASSWORD,
    }),
  });
  if (!sessRes.ok) throw new Error(`session: ${sessRes.status} ${await sessRes.text()}`);
  const { accessJwt, did } = await sessRes.json();

  const curRes = await fetch(
    `${PDS}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.bsky.actor.profile&rkey=self`,
    { headers: { Authorization: `Bearer ${accessJwt}` } }
  );
  const existing = curRes.ok ? (await curRes.json()).value : {};
  console.log('current:', JSON.stringify(existing).slice(0, 150));

  const putRes = await fetch(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.actor.profile',
      rkey: 'self',
      record: {
        ...existing,
        $type: 'app.bsky.actor.profile',
        displayName: DISPLAY_NAME,
        description: DESCRIPTION,
      },
    }),
  });
  if (!putRes.ok) throw new Error(`putRecord: ${putRes.status} ${await putRes.text()}`);
  console.log('✅ profile updated:', DISPLAY_NAME);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
