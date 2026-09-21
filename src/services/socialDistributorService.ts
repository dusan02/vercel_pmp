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

        // 0. Quota Management: Check daily limit (X API Free Tier safety)
        const quotaKey = `social:quota:daily:${date}`;
        const currentQuota = await redisClient.get(quotaKey);
        const dailyLimit = 15;

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
                    { latestMoversZScore: { gte: 3.0 }, latestMoversRVOL: { gte: 2.0 } },
                    { latestMoversZScore: { lte: -3.0 }, latestMoversRVOL: { gte: 2.0 } },
                    // Volume-driven mover without extreme z-score
                    { latestMoversRVOL: { gte: 3.0 }, lastChangePct: { gte: 3.0 } },
                    { latestMoversRVOL: { gte: 3.0 }, lastChangePct: { lte: -3.0 } },
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
                if (toPost.length >= 3) break; // Maximum 3 posts per run
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
                const tweetText = `${mover.socialCopy}\n\nView Analysis: https://premarketprice.com/analysis/${mover.symbol}`;
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
    private bufferChannelIds: string[] | null | undefined;

    private async getPoster(): Promise<((mover: any, text: string) => Promise<void>) | null> {
        if (process.env.BUFFER_ACCESS_TOKEN) {
            const channelIds = await this.getBufferChannelIds();
            if (channelIds && channelIds.length > 0) {
                return (_mover, text) => this.postViaBuffer(channelIds, text);
            }
            console.warn('⚠️ SocialDistributorService: BUFFER_ACCESS_TOKEN set but no channels found in Buffer');
        }

        const twitterClient = this.getTwitterClient();
        if (!twitterClient) return null;

        return async (mover, text) => {
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
    private async getBufferChannelIds(): Promise<string[] | null> {
        if (this.bufferChannelIds !== undefined) return this.bufferChannelIds;
        try {
            const account = await this.bufferGraphql('query { account { organizations { id } } }');
            const orgId = account?.data?.account?.organizations?.[0]?.id;
            if (!orgId) return (this.bufferChannelIds = null);

            const channels = await this.bufferGraphql(
                'query($orgId: ID!) { channels(input: { organizationId: $orgId }) { id service } }',
                { orgId }
            );
            const wanted = new Set(['twitter', 'x', 'threads', 'bluesky']);
            this.bufferChannelIds = (channels?.data?.channels ?? [])
                .filter((c: any) => wanted.has(c.service))
                .map((c: any) => c.id as string);
        } catch (e) {
            console.warn('⚠️ SocialDistributorService: Buffer channel lookup failed', e);
            this.bufferChannelIds = null;
        }
        return this.bufferChannelIds ?? null;
    }

    /** Publish immediately (shareNow) to all connected channels. Throws if every channel fails. */
    private async postViaBuffer(channelIds: string[], text: string): Promise<void> {
        let successes = 0;
        let lastError: unknown;
        for (const channelId of channelIds) {
            const res = await this.bufferGraphql(
                `mutation($channelId: ID!, $text: String!) {
                  createPost(input: { channelId: $channelId, text: $text, schedulingType: automatic, mode: shareNow }) {
                    ... on PostActionSuccess { post { id status } }
                    ... on MutationError { message }
                  }
                }`,
                { channelId, text }
            ).catch(e => ({ __error: e }));

            const err = (res as any)?.__error ?? res?.errors?.[0]?.message ?? res?.data?.createPost?.message;
            if (err) {
                console.warn(`⚠️ SocialDistributorService: Buffer post to channel ${channelId} failed:`, err);
                lastError = err;
            } else {
                successes++;
            }
        }
        if (successes === 0) throw new Error(`Buffer post failed on all channels: ${String(lastError).slice(0, 200)}`);
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
