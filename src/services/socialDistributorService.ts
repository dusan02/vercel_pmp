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
    private bufferProfileId: string | null | undefined;

    private async getPoster(): Promise<((mover: any, text: string) => Promise<void>) | null> {
        if (process.env.BUFFER_ACCESS_TOKEN) {
            const profileId = await this.getBufferXProfileId();
            if (profileId) return (_mover, text) => this.postViaBuffer(profileId, text);
            console.warn('⚠️ SocialDistributorService: BUFFER_ACCESS_TOKEN set but no X channel found in Buffer');
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

    /** First X (twitter) channel connected to the Buffer account. Cached per process. */
    private async getBufferXProfileId(): Promise<string | null> {
        if (this.bufferProfileId !== undefined) return this.bufferProfileId;
        try {
            const res = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${process.env.BUFFER_ACCESS_TOKEN}`);
            if (!res.ok) {
                console.warn(`⚠️ SocialDistributorService: Buffer profiles fetch failed (${res.status})`);
                return (this.bufferProfileId = null);
            }
            const profiles = await res.json();
            const xProfile = (profiles as any[]).find(p => p.service === 'twitter' || p.service === 'x');
            this.bufferProfileId = (xProfile?.id as string | undefined) ?? null;
        } catch (e) {
            console.warn('⚠️ SocialDistributorService: Buffer profiles fetch error', e);
            this.bufferProfileId = null;
        }
        return this.bufferProfileId;
    }

    private async postViaBuffer(profileId: string, text: string): Promise<void> {
        const res = await fetch(`https://api.bufferapp.com/1/updates/create.json?access_token=${process.env.BUFFER_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                'profile_ids[]': profileId,
                text,
                now: 'true',
            }).toString(),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Buffer post failed (${res.status}): ${body.slice(0, 200)}`);
        }
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
