import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';
import { REDIS_KEYS } from '@/lib/redis/keys';
import { getDateET } from '@/lib/utils/dateET';
import { TwitterApi } from 'twitter-api-v2';

export class SocialDistributorService {
    /**
     * Post top movers to X (Twitter)
     */
    async distributeTopMovers(): Promise<{ posted: string[]; skipped: number; errors: number }> {
        const date = getDateET();
        const results = { posted: [] as string[], skipped: 0, errors: 0 };

        // 0. Quota Management: quality over quantity — a few strong
        // signals per day, not a bot stream (also leaves headroom under
        // the X free-tier cap for manual posts).
        const quotaKey = `social:quota:daily:${date}`;
        const currentQuota = await redisClient.get(quotaKey);
        const dailyLimit = 4;

        if (currentQuota && parseInt(currentQuota) >= dailyLimit) {
            console.log(`🚫 SocialDistributorService: Daily quota reached (${currentQuota}/${dailyLimit}). Skipping distribution.`);
            return results;
        }

        // 1. Get significant movers with AI insights and social copy
        const movers = await prisma.ticker.findMany({
            where: {
                latestMoversZScore: { not: null },
                moversReason: { not: null },
                socialCopy: { not: null },
                OR: [
                    // Statistical outlier with volume confirmation
                    { latestMoversZScore: { gte: 4.0 }, latestMoversRVOL: { gte: 2.0 } },
                    { latestMoversZScore: { lte: -4.0 }, latestMoversRVOL: { gte: 2.0 } },
                    // Volume-driven mover without extreme z-score
                    { latestMoversRVOL: { gte: 4.0 }, lastChangePct: { gte: 5.0 } },
                    { latestMoversRVOL: { gte: 4.0 }, lastChangePct: { lte: -5.0 } },
                ]
            },
            orderBy: [
                { latestMoversZScore: 'desc' }
            ],
            take: 10 // Consider top 10 for distribution
        });

        if (movers.length === 0) {
            console.log('ℹ️ SocialDistributorService: No suitable alpha signals found today');
            return results;
        }

        // 2. Filter for those not already posted today
        const toPost = [];
        for (const mover of movers) {
            const lockKey = `social:posted:${date}:${mover.symbol}`;
            const alreadyPosted = await redisClient.get(lockKey);

            if (!alreadyPosted) {
                toPost.push(mover);
                if (toPost.length >= 1) break; // 1 post per run — the 30-min cron provides natural spacing
            } else {
                results.skipped++;
            }
        }

        if (toPost.length === 0) {
            console.log('ℹ️ SocialDistributorService: All current alpha signals were already posted today');
            return results;
        }

        // 3. Setup poster — Buffer (preferred: Buffer holds the X API
        // relationship, so no X credits needed) with direct X API fallback.
        const poster = await this.getPoster();
        if (!poster) {
            console.warn('⚠️ SocialDistributorService: No posting channel configured (BUFFER_ACCESS_TOKEN or TWITTER_*), skipping');
            return results;
        }

        // 4. Post to X
        for (const mover of toPost) {
            try {
                console.log(`🐦 SocialDistributorService: Posting alpha signal for ${mover.symbol}...`);
                // socialCopy was generated earlier — its embedded % can be
                // stale vs the live lastChangePct shown on the OG card.
                // Patch every % token to the live value so text and image match.
                let copy = mover.socialCopy!;
                const livePct = mover.lastChangePct;
                if (livePct != null) {
                    const liveStr = `${livePct >= 0 ? '+' : ''}${livePct.toFixed(2)}%`;
                    copy = copy.replace(/[+-]?\d+(?:\.\d+)?\s*%/g, liveStr);
                    // Older stored copy has no emoji — prepend a directional one
                    if (!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(copy)) {
                        copy = `${livePct >= 0 ? '📈' : '📉'} ${copy}`;
                    }
                }
                const tweetText = `${copy}\n\nFull breakdown: https://premarketprice.com/analysis/${mover.symbol}`;
                await poster(mover, tweetText);

                // 4d. Mark as posted today (TTL 24h)
                const lockKey = `social:posted:${date}:${mover.symbol}`;
                await redisClient.set(lockKey, '1', { EX: 86400 });

                // 4e. Increment daily quota
                await redisClient.incr(quotaKey);
                if (!currentQuota) await redisClient.expire(quotaKey, 86400);

                results.posted.push(mover.symbol);
                console.log(`✅ SocialDistributorService: Successfully posted ${mover.symbol}`);

            } catch (error) {
                console.error(`❌ SocialDistributorService: Failed to post ${mover.symbol}:`, error);
                results.errors++;
            }
        }

        return results;
    }

    private getTwitterClient() {
        if (!process.env.TWITTER_API_KEY ||
            !process.env.TWITTER_API_SECRET ||
            !process.env.TWITTER_ACCESS_TOKEN ||
            !process.env.TWITTER_ACCESS_SECRET) {
            return null;
        }

        return new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
    }

    /**
     * Posting channel resolver.
     * - BUFFER_ACCESS_TOKEN set → post through Buffer (their API covers the
     *   X relationship; our account's X credits are bypassed entirely).
     * - Otherwise direct X API (requires paid credits on the X side).
     */
    private bufferChannels: { id: string; service: string }[] | null | undefined;

    /**
     * Social links carry per-channel UTM so GA4 can attribute clicks — apps
     * strip referrers, so without UTM social traffic is invisible (shows as
     * direct/(not set)).
     */
    private withChannelUtm(text: string, source: string): string {
        return text.replace(
            /https:\/\/premarketprice\.com\/analysis\/([A-Za-z]+)/g,
            `https://premarketprice.com/analysis/$1?utm_source=${source}&utm_medium=social&utm_campaign=movers`
        );
    }

    private utmSourceForService(service: string): string {
        if (service === 'twitter' || service === 'x') return 'x';
        return service; // threads, bluesky, …
    }

    private async getPoster(): Promise<((mover: any, text: string) => Promise<void>) | null> {
        const posters: ((mover: any, text: string) => Promise<void>)[] = [];

        // Buffer channels (X, Threads, Bluesky if connected there)
        let bufferCoversBluesky = false;
        if (process.env.BUFFER_ACCESS_TOKEN) {
            const channels = await this.getBufferChannels();
            if (channels.length > 0) {
                bufferCoversBluesky = channels.some(c => c.service === 'bluesky');
                posters.push((_mover, text) => this.postViaBuffer(channels, text));
            } else {
                console.warn('⚠️ SocialDistributorService: BUFFER_ACCESS_TOKEN set but no channels found in Buffer');
            }
        }

        // Direct Bluesky via AT Protocol — free, no Buffer needed. Skipped
        // when a bluesky Buffer channel already covers it (no double-posts).
        if (process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD && !bufferCoversBluesky) {
            posters.push((mover, text) => this.postViaBluesky(text, mover));
        }

        if (posters.length === 0) {
            const twitterClient = this.getTwitterClient();
            if (!twitterClient) return null;
            posters.push(this.getTwitterPoster(twitterClient));
        }

        // Composite: run all channels, fail only if every one fails.
        return async (mover, text) => {
            let ok = 0;
            let lastError: unknown;
            for (const post of posters) {
                try {
                    await post(mover, text);
                    ok++;
                } catch (e) {
                    console.warn('⚠️ SocialDistributorService: channel post failed', e);
                    lastError = e;
                }
            }
            if (ok === 0) throw lastError;
        };
    }

    private getTwitterPoster(twitterClient: TwitterApi) {
        return async (mover: any, text: string) => {
            text = this.withChannelUtm(text, 'x');
            const ogImageUrl = this.generateOgImageUrl(mover);
            const imageBuffer = await this.fetchImageBuffer(ogImageUrl);

            // Media upload is best-effort — Free tier has no v1.1 media
            // upload (402), and the analysis link unfurls to our OG card
            // via the page's opengraph-image anyway.
            let media: { media_ids: [string] } | undefined;
            if (imageBuffer) {
                try {
                    const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { type: 'png' });
                    media = { media_ids: [mediaId] };
                } catch {
                    console.warn(`⚠️ SocialDistributorService: media upload failed for ${mover.symbol}, posting text-only`);
                }
            }
            await twitterClient.v2.tweet({ text, ...(media ? { media } : {}) });
        };
    }

    private async bufferGraphql(query: string, variables?: Record<string, unknown>): Promise<any> {
        const res = await fetch('https://api.buffer.com', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ query, variables }),
        });
        if (!res.ok) throw new Error(`Buffer API HTTP ${res.status}`);
        return res.json();
    }

    /** Connected Buffer channels we post to (twitter/x, threads, bluesky). Cached per process. */
    private async getBufferChannels(): Promise<{ id: string; service: string }[]> {
        if (this.bufferChannels !== undefined) return this.bufferChannels ?? [];
        try {
            const account = await this.bufferGraphql('query { account { organizations { id } } }');
            const orgId = account?.data?.account?.organizations?.[0]?.id;
            if (!orgId) return (this.bufferChannels = null) ?? [];

            const channels = await this.bufferGraphql(
                'query($orgId: OrganizationId!) { channels(input: { organizationId: $orgId }) { id service } }',
                { orgId }
            );
            const wanted = new Set(['twitter', 'x', 'threads', 'bluesky']);
            this.bufferChannels = (channels?.data?.channels ?? [])
                .filter((c: any) => wanted.has(c.service));
        } catch (e) {
            console.warn('⚠️ SocialDistributorService: Buffer channel lookup failed', e);
            this.bufferChannels = null;
        }
        return this.bufferChannels ?? [];
    }

    /** Publish immediately (shareNow) to all connected channels. Throws if every channel fails. */
    private async postViaBuffer(channels: { id: string; service: string }[], text: string): Promise<void> {
        let successes = 0;
        let lastError: unknown;
        for (const channel of channels) {
            const channelText = this.withChannelUtm(text, this.utmSourceForService(channel.service));
            const res = await this.bufferGraphql(
                `mutation($channelId: ChannelId!, $text: String!) {
                  createPost(input: { channelId: $channelId, text: $text, schedulingType: automatic, mode: shareNow }) {
                    ... on PostActionSuccess { post { id status } }
                    ... on MutationError { message }
                  }
                }`,
                { channelId: channel.id, text: channelText }
            ).catch(e => ({ __error: e }));

            const err = (res as any)?.__error ?? res?.errors?.[0]?.message ?? res?.data?.createPost?.message;
            if (err) {
                console.warn(`⚠️ SocialDistributorService: Buffer post to channel ${channel.id} (${channel.service}) failed:`, err);
                lastError = err;
            } else {
                successes++;
            }
        }
        if (successes === 0) throw new Error(`Buffer post failed on all channels: ${String(lastError).slice(0, 200)}`);
    }

    // ─── Bluesky (AT Protocol) ──────────────────────────────────────────────
    private bskySession: { accessJwt: string; did: string } | null = null;

    private async createBskySession(): Promise<{ accessJwt: string; did: string }> {
        const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: process.env.BLUESKY_HANDLE,
                password: process.env.BLUESKY_APP_PASSWORD,
            }),
        });
        if (!res.ok) throw new Error(`Bluesky session failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
        this.bskySession = await res.json();
        return this.bskySession!;
    }

    /** Facets make URLs and #hashtags clickable — byte offsets, not char offsets. */
    private bskyLinkFacets(text: string) {
        const encoder = new TextEncoder();
        const facets = [];
        const byteOffset = (charIdx: number) => encoder.encode(text.slice(0, charIdx)).length;
        let m: RegExpExecArray | null;

        const linkRe = /https?:\/\/[^\s]+/g;
        while ((m = linkRe.exec(text)) !== null) {
            facets.push({
                index: { byteStart: byteOffset(m.index), byteEnd: byteOffset(m.index + m[0].length) },
                features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
            });
        }
        const tagRe = /#([A-Za-z0-9_]+)/g;
        while ((m = tagRe.exec(text)) !== null) {
            facets.push({
                index: { byteStart: byteOffset(m.index), byteEnd: byteOffset(m.index + m[0].length) },
                features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }],
            });
        }
        return facets;
    }

    /**
     * Bluesky doesn't unfurl links — a link-preview card must be attached
     * explicitly as app.bsky.embed.external with the image uploaded as a blob.
     */
    private async bskyBuildExternalEmbed(mover: any) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const publicUrl = `https://premarketprice.com/analysis/${mover.symbol}?utm_source=bluesky&utm_medium=social&utm_campaign=movers`;
        const ogImageUrl = `${appUrl}/analysis/${mover.symbol}/opengraph-image`;

        const imgRes = await fetch(ogImageUrl);
        if (!imgRes.ok) return null;
        const imgBytes = await imgRes.arrayBuffer();
        if (imgBytes.byteLength > 950_000) return null; // Bluesky thumb limit ≈ 1MB

        const session = this.bskySession ?? (await this.createBskySession());
        const upRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
            method: 'POST',
            headers: {
                'Content-Type': 'image/png',
                Authorization: `Bearer ${session.accessJwt}`,
            },
            body: imgBytes,
        });
        if (!upRes.ok) return null;
        const { blob } = await upRes.json();

        const pct = mover.lastChangePct;
        const pctStr = pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '';
        return {
            $type: 'app.bsky.embed.external',
            external: {
                uri: publicUrl,
                title: `${mover.symbol} Stock Analysis | PreMarketPrice`,
                description: `${mover.name || mover.symbol} · $${(mover.lastPrice || 0).toFixed(2)} ${pctStr} · ${mover.sector || 'Stock'}`.slice(0, 300),
                thumb: blob,
            },
        };
    }

    private async postViaBluesky(text: string, mover: any): Promise<void> {
        text = this.withChannelUtm(text, 'bluesky');
        // Best-effort OG card — if image fetch/upload fails, post text-only.
        let embed: any = null;
        try {
            embed = await this.bskyBuildExternalEmbed(mover);
        } catch (e) {
            console.warn(`⚠️ SocialDistributorService: Bluesky embed failed for ${mover.symbol}, posting text-only`, e);
        }

        const attempt = async (): Promise<Response> => {
            const session = this.bskySession ?? (await this.createBskySession());
            return fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.accessJwt}`,
                },
                body: JSON.stringify({
                    repo: session.did,
                    collection: 'app.bsky.feed.post',
                    record: {
                        $type: 'app.bsky.feed.post',
                        text,
                        createdAt: new Date().toISOString(),
                        langs: ['en'],
                        facets: this.bskyLinkFacets(text),
                        ...(embed ? { embed } : {}),
                    },
                }),
            });
        };

        let res = await attempt();
        if (res.status === 401 || res.status === 400) {
            // Token may be expired — refresh session and retry once.
            this.bskySession = null;
            res = await attempt();
        }
        if (!res.ok) throw new Error(`Bluesky post failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }

    private generateOgImageUrl(ticker: any): string {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const params = new URLSearchParams({
            symbol: ticker.symbol,
            name: ticker.name || '',
            price: (ticker.lastPrice || 0).toFixed(2),
            changePct: (ticker.lastChangePct || 0).toFixed(2),
            zScore: (ticker.latestMoversZScore || 0).toFixed(2),
            rvol: (ticker.latestMoversRVOL || 0).toFixed(1),
            category: ticker.moversCategory || 'Technical',
            reason: ticker.moversReason || '',
            sbc: ticker.isSbcAlert ? '1' : '0',
            confidence: (ticker.aiConfidence || 0).toString()
        });

        return `${baseUrl}/api/og?${params.toString()}`;
    }

    private async fetchImageBuffer(url: string): Promise<Buffer | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            console.error('Error fetching image buffer:', error);
            return null;
        }
    }
}

export const socialDistributorService = new SocialDistributorService();
