import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';
import { REDIS_KEYS } from '@/lib/redis/keys';
import { getDateET, toET } from '@/lib/utils/dateET';
import { TwitterApi } from 'twitter-api-v2';

/** Optional per-post card overrides (digest posts link to the movers board). */
interface PostOpts {
    cardUrl?: string;
    cardTitle?: string;
    cardDesc?: string;
}

export class SocialDistributorService {
    /**
     * Post top movers to X (Twitter)
     */
    async distributeTopMovers(opts?: { force?: boolean }): Promise<{ posted: string[]; skipped: number; errors: number }> {
        const date = getDateET();
        const results = { posted: [] as string[], skipped: 0, errors: 0 };

        // Window guard — see inPostingWindow. Singles may post 06:30–17:30 ET
        // on weekdays; a PM2 bootstrap fire must not publish stale movers.
        if (!opts?.force && !this.inPostingWindow('single')) {
            console.log('ℹ️ SocialDistributorService: outside posting window, skipping singles distribution');
            return results;
        }

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
                const copy = this.patchSocialCopy(mover.socialCopy!, mover);
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

    /**
     * Reconcile stored socialCopy with live values at post time: the embedded
     * %, direction emoji and volume/extremity stats were frozen at generation
     * time and can drift — or even flip sign — before the 30-min cron posts
     * them. Quant jargon is rewritten to plain language at the same time:
     * "RVOL 2.8x" → "Volume 2.8× normal" and "Z-score -5.00σ" → "~5.0× its
     * typical daily move" — the Z-score literally IS the move measured in
     * typical-move units. Already-plain copies still get refreshed to live
     * numbers.
     */
    private patchSocialCopy(
        copy: string,
        mover: { lastChangePct: number | null; latestMoversRVOL: number | null; latestMoversZScore: number | null }
    ): string {
        const livePct = mover.lastChangePct;
        if (livePct != null) {
            const liveStr = `${livePct >= 0 ? '+' : ''}${livePct.toFixed(2)}%`;
            copy = copy.replace(/[+-]?\d+(?:\.\d+)?\s*%/g, liveStr);
            // Direction emoji must match the LIVE sign — a move can flip
            // between copy generation and posting (stored 📈, live −6%).
            const dirEmoji = livePct >= 0 ? '📈' : '📉';
            if (/[\u{1F4C8}\u{1F4C9}]/u.test(copy)) {
                copy = copy.replace(/[\u{1F4C8}\u{1F4C9}]/u, dirEmoji);
            } else if (!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(copy)) {
                copy = `${dirEmoji} ${copy}`;
            }
        }
        if (mover.latestMoversRVOL != null) {
            copy = copy.replace(
                /\b(?:RVOL|Volume|relative\s+volume)[:\s]*(?:N\/A|[+-]?\d+(?:\.\d+)?)\s*[x×]\s*(?:of\s+)?(?:normal)?|\b\d+(?:\.\d+)?\s*[x×]\s+relative\s+volume\b/gi,
                `Volume ${mover.latestMoversRVOL.toFixed(1)}× normal`
            );
        }
        if (mover.latestMoversZScore != null) {
            const zAbs = Math.abs(mover.latestMoversZScore);
            copy = copy.replace(
                /\bZ[-\s]?[Ss]core:?\s*[+-]?\d+(?:\.\d+)?\s*σ?|\bZ[:=]\s*[+-]?\d+(?:\.\d+)?\s*σ|~?\d+(?:\.\d+)?\s*[x×]\s+(?:its\s+)?typical\s+daily\s+move\b/gi,
                `~${zAbs.toFixed(1)}× its typical daily move`
            );
        }
        return copy;
    }

    /**
     * Posting-time window guard — `pm2 start --only` fires trigger scripts
     * immediately at registration (not at cron time), so an off-schedule run
     * must not publish a mislabeled digest mid-session and burn the daily
     * lock. Weekday + ET window per post kind.
     */
    private inPostingWindow(kind: 'recap' | 'single'): boolean {
        const et = toET(new Date());
        if (et.weekday === 0 || et.weekday === 6) return false;
        const min = et.hour * 60 + et.minute;
        const [start, end] = kind === 'recap' ? [15 * 60 + 30, 17 * 60 + 30]
            : [6 * 60 + 30, 17 * 60 + 30];
        return min >= start && min <= end;
    }

    /**
     * Daily recap post ("Today's biggest movers", ~16:05 ET) — the single
     * daily list post. A morning "Before the open" digest was removed: at
     * 08:45 ET `lastChangePct` still holds yesterday's regular-session
     * change, so it republished the previous evening's recap verbatim —
     * structurally duplicate content every day.
     * Separate daily lock, independent of the 4/day single-mover quota —
     * this is anchor content, not part of the signal stream.
     */
    async postDailyRecap(opts?: { force?: boolean }): Promise<{ posted: string[]; skipped: number; errors: number }> {
        const date = getDateET();
        const results = { posted: [] as string[], skipped: 0, errors: 0 };

        // Window guard — an off-schedule run (e.g. PM2 registration bootstrap)
        // must not post the recap mid-session and burn the daily lock.
        // ?force=1 on the route bypasses for manual retries.
        if (!opts?.force && !this.inPostingWindow('recap')) {
            console.log('ℹ️ SocialDistributorService: outside recap window, skipping digest');
            return results;
        }

        const lockKey = `social:recap:${date}`;
        if (await redisClient.get(lockKey)) {
            console.log('ℹ️ SocialDistributorService: recap digest already posted today');
            return results;
        }

        // Biggest movers by |day change| — $1+ price and ±100% cap keep
        // zombie tickers (sub-penny, stale refs) off the recap.
        const select = {
            symbol: true, name: true, lastPrice: true, lastChangePct: true,
            latestMoversZScore: true, latestMoversRVOL: true,
            moversReason: true, socialCopy: true, moversCategory: true,
            isSbcAlert: true, aiConfidence: true
        } as const;
        const [gainers, losers] = await Promise.all([
            prisma.ticker.findMany({
                where: { lastPrice: { gte: 1 }, lastChangePct: { gt: 0, lte: 100 } },
                orderBy: { lastChangePct: 'desc' }, take: 3, select
            }),
            prisma.ticker.findMany({
                where: { lastPrice: { gte: 1 }, lastChangePct: { lt: 0, gte: -100 } },
                orderBy: { lastChangePct: 'asc' }, take: 2, select
            }),
        ]);
        const movers = [...gainers, ...losers]
            .sort((a, b) => Math.abs(b.lastChangePct ?? 0) - Math.abs(a.lastChangePct ?? 0))
            .slice(0, 4);

        if (movers.length === 0) {
            console.log('ℹ️ SocialDistributorService: no movers for recap digest');
            return results;
        }

        const lines = movers.map(m => {
            const pct = m.lastChangePct ?? 0;
            const emoji = pct >= 0 ? '📈' : '📉';
            const reason = this.extractCatalyst(m);
            return `${emoji} $${m.symbol} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%${reason ? ` — ${reason}` : ''}`;
        });
        const header = "📊 Today's biggest movers:";
        const cta = 'Full movers board';
        // When today's daily recap exists, route part of the click traffic to
        // /blog/[date] — it fans out into analysis/premarket pages from there.
        let recapLine = '';
        try {
          const snap = await prisma.dailyBlogSnapshot.findUnique({ where: { date }, select: { date: true } });
          if (snap) recapLine = `\nFull recap → https://premarketprice.com/blog/${date}`;
        } catch { /* link stays optional */ }
        const text = `${header}\n\n${lines.join('\n')}\n\n${cta} → https://premarketprice.com/premarket-movers${recapLine}`;

        const poster = await this.getPoster();
        if (!poster) {
            console.warn('⚠️ SocialDistributorService: No posting channel configured, skipping digest');
            return results;
        }

        try {
            // OG card shows the top mover — the post's headline stock. On
            // Bluesky the card IS the only link (URL lines get stripped to
            // fit 300 graphemes), so point it at the movers board, not the
            // top mover's analysis page.
            await poster(movers[0], text, {
                cardUrl: 'https://premarketprice.com/premarket-movers',
                cardTitle: "Today's Biggest Movers | PreMarketPrice",
                cardDesc: 'Live movers board — abnormal moves with catalysts and fundamental context.',
            });
            await redisClient.set(lockKey, '1', { EX: 86400 });
            results.posted = movers.map(m => m.symbol);
            console.log(`✅ SocialDistributorService: recap digest posted (${results.posted.join(', ')})`);
        } catch (error) {
            console.error('❌ SocialDistributorService: recap digest failed:', error);
            results.errors++;
        }
        return results;
    }

    /**
     * Short catalyst phrase for a digest line — prefer the LLM socialCopy
     * lead (already "% + short catalyst"), fall back to moversReason, then
     * "unusual volume" only when RVOL actually confirms it. ~42 chars max.
     */
    private extractCatalyst(mover: any): string {
        const clean = (raw: string) => raw
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
            .replace(new RegExp(`\\$?${mover.symbol}\\b`, 'g'), '')
            .replace(/[+-]?\d+(?:\.\d+)?\s*%/g, '')
            .replace(/^\s*(?:on|with|amid)\s+/i, '')
            .trim();

        let s = clean((mover.socialCopy || '').split('\n')[0] || '');
        if (!this.hasCatalystSubstance(s)) s = clean(String(mover.moversReason || ''));
        if (!this.hasCatalystSubstance(s)) s = (mover.latestMoversRVOL ?? 0) >= 2 ? 'unusual volume' : '';
        if (s.length > 42) s = s.slice(0, 42).replace(/\s+\S*$/, '').replace(/[.,;:\s]+$/, '') + '…';
        return s;
    }

    /**
     * A digest "reason" must carry real information — quant fragments like
     * "0.1x relative volume" or "statistical outlier" describe the
     * measurement, not the cause, and read as broken copy. Test: after
     * stripping numbers, jargon and filler verbs, at least one substantive
     * word must remain ("acquisition", "election", "earnings"…).
     */
    private hasCatalystSubstance(s: string): boolean {
        if (!s) return false;
        const FILLER = new Set([
            'on', 'the', 'a', 'an', 'of', 'with', 'and', 'in', 'to', 'at', 'as', 'by', 'for', 'no',
            'is', 'it', 'its', 'x', 'up', 'down', 'high', 'higher', 'low', 'lower', 'today',
            'surging', 'soaring', 'plunging', 'tanking', 'jumping', 'dumping', 'spiking', 'rallying',
            'upward', 'downward',
            'volatility', 'volume', 'relative', 'rvol', 'move', 'moves', 'moving', 'sharply',
            'premarket', 'watch', 'closely', 'extreme', 'outlier', 'statistical', 'unusual',
            'elevated', 'heavy', 'activity', 'interest', 'sentiment', 'driven', 'broader', 'market',
            'sector', 'possible', 'immediate', 'public', 'news', 'catalyst', 'without', 'specific',
            'clear', 'z', 'score', 'sigma', 'standard', 'deviation',
        ]);
        const core = s.toLowerCase()
            .replace(/\b\d+(?:\.\d+)?\s*(?:x|%|σ|bps?|million|billion|m|b)\b/g, ' ')
            .replace(/z[-\s]?score|σ/g, ' ')
            .replace(/[^a-z\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!core) return false;
        return core.split(' ').some(w => w.length >= 3 && !FILLER.has(w));
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
            /https:\/\/premarketprice\.com\/(analysis\/[A-Za-z]+|premarket-movers|blog\/[A-Za-z0-9-]+)\b/g,
            `https://premarketprice.com/$1?utm_source=${source}&utm_medium=social&utm_campaign=movers`
        );
    }

    /** Public OG-card URL — Buffer's crawler can't reach the loopback base. */
    private publicOgImageUrl(ticker: any): string {
        return this.generateOgImageUrl(ticker).replace(/^https?:\/\/[^/]+/, this.publicSiteUrl());
    }

    private publicSiteUrl(): string {
        const base = process.env.NEXT_PUBLIC_APP_URL || '';
        return !base || /localhost|127\.0\.0\.1/.test(base) ? 'https://premarketprice.com' : base;
    }

    private utmSourceForService(service: string): string {
        if (service === 'twitter' || service === 'x') return 'x';
        return service; // threads, bluesky, …
    }

    private async getPoster(): Promise<((mover: any, text: string, opts?: PostOpts) => Promise<void>) | null> {
        const posters: ((mover: any, text: string, opts?: PostOpts) => Promise<void>)[] = [];

        // Buffer channels (X, Threads, Bluesky if connected there)
        let bufferCoversBluesky = false;
        if (process.env.BUFFER_ACCESS_TOKEN) {
            const channels = await this.getBufferChannels();
            if (channels.length > 0) {
                bufferCoversBluesky = channels.some(c => c.service === 'bluesky');
                posters.push((mover, text) => this.postViaBuffer(channels, text, mover));
            } else {
                console.warn('⚠️ SocialDistributorService: BUFFER_ACCESS_TOKEN set but no channels found in Buffer');
            }
        }

        // Direct Bluesky via AT Protocol — free, no Buffer needed. Skipped
        // when a bluesky Buffer channel already covers it (no double-posts).
        if (process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD && !bufferCoversBluesky) {
            posters.push((mover, text, opts) => this.postViaBluesky(text, mover, opts));
        }

        if (posters.length === 0) {
            const twitterClient = this.getTwitterClient();
            if (!twitterClient) return null;
            posters.push(this.getTwitterPoster(twitterClient));
        }

        // Composite: run all channels, fail only if every one fails.
        return async (mover, text, opts) => {
            let ok = 0;
            let lastError: unknown;
            for (const post of posters) {
                try {
                    await post(mover, text, opts);
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
                'query($orgId: OrganizationId!) { channels(input: { organizationId: $orgId }) { id service name displayName isDisconnected } }',
                { orgId }
            );
            const wanted = new Set(['twitter', 'x', 'threads', 'bluesky']);
            // Brand-scope: post only to channels named after the brand —
            // the Buffer account can have personal profiles connected too
            // (e.g. a personal Threads handle) and bot posts must never land
            // on those. BUFFER_BRAND_NAME overrides the default match.
            const brand = (process.env.BUFFER_BRAND_NAME || 'premarketprice').toLowerCase();
            this.bufferChannels = (channels?.data?.channels ?? [])
                .filter((c: any) => wanted.has(c.service))
                .filter((c: any) => !c.isDisconnected)
                .filter((c: any) => `${c.name} ${c.displayName}`.toLowerCase().includes(brand));
        } catch (e) {
            console.warn('⚠️ SocialDistributorService: Buffer channel lookup failed', e);
            this.bufferChannels = null;
        }
        return this.bufferChannels ?? [];
    }

    /** Publish immediately (shareNow) to all connected channels. Throws if every channel fails. */
    private async postViaBuffer(channels: { id: string; service: string }[], text: string, mover?: any): Promise<void> {
        // OG card image — Buffer fetches the URL server-side, so it must be
        // the public origin (NEXT_PUBLIC_APP_URL is 127.0.0.1 on prod).
        const imageUrl = mover ? this.publicOgImageUrl(mover) : null;
        let successes = 0;
        let lastError: unknown;
        for (const channel of channels) {
            const channelText = this.withChannelUtm(text, this.utmSourceForService(channel.service));
            const input: Record<string, unknown> = {
                channelId: channel.id,
                text: channelText,
                schedulingType: 'automatic',
                mode: 'shareNow',
            };
            if (imageUrl) input.assets = [{ image: { url: imageUrl } }];
            const res = await this.bufferGraphql(
                `mutation($input: CreatePostInput!) {
                  createPost(input: $input) {
                    ... on PostActionSuccess { post { id status } }
                    ... on MutationError { message }
                  }
                }`,
                { input }
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
    private async bskyBuildExternalEmbed(mover: any, opts?: PostOpts) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const utm = 'utm_source=bluesky&utm_medium=social&utm_campaign=movers';
        const baseUrl = opts?.cardUrl ?? `https://premarketprice.com/analysis/${mover.symbol}`;
        const publicUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${utm}`;
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
                title: opts?.cardTitle ?? `${mover.symbol} Stock Analysis | PreMarketPrice`,
                description: (opts?.cardDesc ?? `${mover.name || mover.symbol} · $${(mover.lastPrice || 0).toFixed(2)} ${pctStr} · ${mover.sector || 'Stock'}`).slice(0, 300),
                thumb: blob,
            },
        };
    }

    /**
     * Bluesky counts full URL chars (no t.co-style shortening) and hard-caps
     * posts at 300 graphemes — a ~340-char digest fails createRecord with
     * 400. When over, drop URL lines first: the embed card already carries
     * the click target, so inline links are redundant. Word-boundary
     * truncate as last resort.
     */
    private bskyFitText(text: string): string {
        const LIMIT = 300;
        if (this.graphemeLength(text) <= LIMIT) return text;
        let t = text
            .split('\n')
            .filter(l => !/https?:\/\//.test(l))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (this.graphemeLength(t) > LIMIT) {
            t = this.truncateGraphemes(t, LIMIT - 1).replace(/\s+\S*$/, '').replace(/[.,;:\s—-]+$/, '') + '…';
        }
        return t;
    }

    private graphemeLength(text: string): number {
        const Seg = (Intl as any).Segmenter;
        if (!Seg) return [...text].length;
        return [...new Seg('en', { granularity: 'grapheme' }).segment(text)].length;
    }

    private truncateGraphemes(text: string, max: number): string {
        const Seg = (Intl as any).Segmenter;
        if (!Seg) return [...text].slice(0, max).join('');
        return [...new Seg('en', { granularity: 'grapheme' }).segment(text)]
            .slice(0, max)
            .map((s: any) => s.segment)
            .join('');
    }

    private async postViaBluesky(text: string, mover: any, opts?: PostOpts): Promise<void> {
        text = this.bskyFitText(this.withChannelUtm(text, 'bluesky'));
        // Best-effort OG card — if image fetch/upload fails, post text-only.
        let embed: any = null;
        try {
            embed = await this.bskyBuildExternalEmbed(mover, opts);
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
