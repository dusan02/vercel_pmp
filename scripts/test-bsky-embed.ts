/**
 * E2E test: Bluesky post with embed.external link-preview card.
 * Posts a test record, prints the AT-URI, then deletes it.
 * Usage: npx tsx scripts/test-bsky-embed.ts [SYMBOL]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

const SYMBOL = process.argv[2] || 'WBD';
const PDS = 'https://bsky.social';

async function main() {
  const identifier = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) throw new Error('BLUESKY_HANDLE / BLUESKY_APP_PASSWORD missing');

  const sessRes = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!sessRes.ok) throw new Error(`session: ${sessRes.status} ${await sessRes.text()}`);
  const { accessJwt, did } = await sessRes.json();
  console.log('✅ session', did);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001';
  const imgRes = await fetch(`${appUrl}/analysis/${SYMBOL}/opengraph-image`);
  if (!imgRes.ok) throw new Error(`og image: ${imgRes.status}`);
  const imgBytes = await imgRes.arrayBuffer();
  console.log(`✅ og image ${imgBytes.byteLength}b`);

  const upRes = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${accessJwt}` },
    body: imgBytes,
  });
  if (!upRes.ok) throw new Error(`uploadBlob: ${upRes.status} ${await upRes.text()}`);
  const { blob } = await upRes.json();
  console.log('✅ blob', blob.ref?.$link?.slice(0, 20));

  const uri = `https://premarketprice.com/analysis/${SYMBOL}`;
  const text = `🧪 embed test $${SYMBOL}\n\n${uri}`;
  const enc = new TextEncoder();
  const idx = text.indexOf(uri);
  const recRes = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        langs: ['en'],
        facets: [{
          index: { byteStart: enc.encode(text.slice(0, idx)).length, byteEnd: enc.encode(text.slice(0, idx)).length + enc.encode(uri).length },
          features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
        }],
        embed: {
          $type: 'app.bsky.embed.external',
          external: { uri, title: `${SYMBOL} Stock Analysis | PreMarketPrice`, description: 'embed test', thumb: blob },
        },
      },
    }),
  });
  const recBody = await recRes.text();
  if (!recRes.ok) throw new Error(`createRecord: ${recRes.status} ${recBody}`);
  const { uri: atUri } = JSON.parse(recBody);
  console.log('✅ post created:', atUri);

  const rkey = atUri.split('/').pop();
  const delRes = await fetch(`${PDS}/xrpc/com.atproto.repo.deleteRecord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', rkey }),
  });
  console.log(delRes.ok ? '✅ deleted' : `⚠️ delete failed: ${delRes.status}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
