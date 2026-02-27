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
                latestMoversRVOL: { gte: 2.0 },
                moversReason: { not: null },
                socialCopy: { not: null },
                OR: [
                    { latestMoversZScore: { gte: 4.0 } },
                    { latestMoversZScore: { lte: -4.0 } }
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

        // 3. Setup Twitter client
        const twitterClient = this.getTwitterClient();
        if (!twitterClient) {
            console.warn('⚠️ SocialDistributorService: Twitter credentials missing, skipping actual posting');
            return results;
        }

        // 4. Post to X
        for (const mover of toPost) {
            try {
                console.log(`🐦 SocialDistributorService: Posting alpha signal for ${mover.symbol}...`);

                // 4a. Generate OG Image (fetch from our own API)
                const ogImageUrl = this.generateOgImageUrl(mover);
                const imageBuffer = await this.fetchImageBuffer(ogImageUrl);

                if (!imageBuffer) {
                    throw new Error(`Failed to fetch OG image for ${mover.symbol}`);
                }

                // 4b. Upload media to X
                const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { type: 'png' });

                // 4c. Post tweet
                const tweetText = `${mover.socialCopy}\n\nView Analysis: https://premarketprice.pro/ticker/${mover.symbol}`;
                await twitterClient.v2.tweet({
                    text: tweetText,
                    media: { media_ids: [mediaId] }
                });

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
