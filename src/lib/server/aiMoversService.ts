import { prisma } from '@/lib/db/prisma';
import { getPolygonClient } from '@/lib/clients/polygonClient';
import { redisClient } from '@/lib/redis';
import { REDIS_KEYS } from '@/lib/redis/keys';
import { getDateET } from '@/lib/utils/dateET';
import { mapToRedisSession, detectSession } from '@/lib/utils/timeUtils';

export interface MoverInsight {
    symbol: string;
    reason: string;
    category: string;
    socialCopy?: string;
    isSbcAlert: boolean;
    aiConfidence: number;
}

// AI threshold: only analyze stocks with statistically extreme moves
const AI_ZSCORE_THRESHOLD = 2.5;

export class AiMoversService {
    /**
     * Process pending movers to generate AI insights
     */
    async processMoversInsights(): Promise<{ success: number; failed: number }> {
        const date = getDateET();
        const session = detectSession(new Date());
        const redisSession = mapToRedisSession(session);
        const zscoreKey = REDIS_KEYS.rankZScore(date, redisSession);

        let topSymbols: string[] = [];

        if (redisClient && redisClient.isOpen) {
            // Get top movers by absolute Z-score – both gainers AND losers
            topSymbols = await redisClient.zRange(zscoreKey, 0, 19);
        } else {
            console.warn('⚠️ AiMoversService: Redis not available, falling back to DB');
            const tickers = await prisma.ticker.findMany({
                where: {
                    OR: [
                        { latestMoversZScore: { gte: AI_ZSCORE_THRESHOLD } },
                        { latestMoversZScore: { lte: -AI_ZSCORE_THRESHOLD } }
                    ]
                },
                orderBy: { latestMoversZScore: 'desc' },
                take: 20,
                select: { symbol: true }
            });
            topSymbols = tickers.map(t => t.symbol);
        }

        if (topSymbols.length === 0) {
            console.log('ℹ️ AiMoversService: No movers found');
            return { success: 0, failed: 0 };
        }

        // Filter for significant movers: |Z| >= 2.5 OR RVOL >= 2.0
        const tickers = await prisma.ticker.findMany({
            where: {
                symbol: { in: topSymbols },
                OR: [
                    { latestMoversZScore: { gte: AI_ZSCORE_THRESHOLD } },
                    { latestMoversZScore: { lte: -AI_ZSCORE_THRESHOLD } },
                    { latestMoversRVOL: { gte: 2.0 } }
                ]
            },
            select: {
                symbol: true,
                name: true,
                latestMoversZScore: true,
                latestMoversRVOL: true,
                lastChangePct: true,
                lastPrice: true,
                sector: true,
                moversReason: true,
            }
        });

        const pendingTickers = tickers.filter(t => !t.moversReason);
        console.log(`🤖 AiMoversService: ${pendingTickers.length} tickers need AI insights`);

        let success = 0;
        let failed = 0;

        for (const ticker of pendingTickers) {
            const insight = await this.generateInsightForTicker(ticker);
            if (insight) {
                try {
                    await prisma.ticker.update({
                        where: { symbol: ticker.symbol },
                        data: {
                            moversReason: insight.reason,
                            moversCategory: insight.category,
                            socialCopy: insight.socialCopy ?? null,
                            isSbcAlert: insight.isSbcAlert,
                            aiConfidence: insight.aiConfidence,
                        }
                    });

                    // Also update Redis hot cache
                    if (redisClient && redisClient.isOpen) {
                        await redisClient.hSet(`stock:${ticker.symbol}`, {
                            reason: insight.reason,
                            cat: insight.category,
                            copy: insight.socialCopy || '',
                            sbc: insight.isSbcAlert ? '1' : '0',
                            conf: (insight.aiConfidence || 0).toString()
                        });
                    }

                    success++;
                } catch (error) {
                    console.error(`❌ AiMoversService: DB update failed for ${ticker.symbol}:`, error);
                    failed++;
                }
            } else {
                failed++;
            }
        }

        return { success, failed };
    }

    /**
     * Fetch news and generate an enriched insight for a single ticker.
     * The ticker object now carries quantitative context (changePct, Z-score, RVOL)
     * which is injected into the LLM prompt for much more accurate analysis.
     */
    private async generateInsightForTicker(
        ticker: {
            symbol: string;
            name: string | null;
            latestMoversZScore: number | null;
            latestMoversRVOL: number | null;
            lastChangePct: number | null;
            lastPrice: number | null;
            sector: string | null;
        }
    ): Promise<MoverInsight | null> {
        const { symbol, name, latestMoversZScore, latestMoversRVOL, lastChangePct, sector } = ticker;

        // Format quantitative context for the prompt
        const direction = (lastChangePct ?? 0) >= 0 ? 'up' : 'down';
        const changePctStr = lastChangePct != null ? `${lastChangePct > 0 ? '+' : ''}${lastChangePct.toFixed(2)}%` : 'unknown';
        const zStr = latestMoversZScore != null ? latestMoversZScore.toFixed(2) : 'N/A';
        const rvolStr = latestMoversRVOL != null ? `${latestMoversRVOL.toFixed(1)}x` : 'N/A';

        try {
            // 1. Fetch recent news (last 3 days) via Finnhub
            const finnhubKey = process.env.FINNHUB_API_KEY;
            let newsSummary = '';

            if (finnhubKey) {
                const toDate = new Date().toISOString().split('T')[0];
                const fromDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                const finnhubUrl = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${finnhubKey}`;
                const res = await fetch(finnhubUrl);

                if (res.ok) {
                    const rawNews = await res.json();
                    if (Array.isArray(rawNews) && rawNews.length > 0) {
                        // Take top 5 news entries
                        newsSummary = rawNews.slice(0, 5)
                            .map((n: any) => {
                                const dateStr = new Date(n.datetime * 1000).toISOString().replace('T', ' ').substring(0, 16);
                                return `- ${n.headline} (${dateStr}): ${n.summary?.substring(0, 120) || ''}`;
                            })
                            .join('\n');
                    }
                }
            }

            if (!newsSummary) {
                // Smart fallback: use the quantitative data to construct a meaningful reason
                return this.buildNoNewsFallback(symbol, direction, changePctStr, zStr, rvolStr, sector);
            }

            // 2. Build enriched prompt with full quantitative context

            const prompt = `
You are an expert financial analyst. Analyze the following market data and news for ${symbol} (${name || symbol}, sector: ${sector || 'Unknown'}).

PRICE ACTION:
- Today's move: ${changePctStr} (${direction})
- Z-score: ${zStr} standard deviations from 20-day mean (extreme = unusual)
- Relative Volume (RVOL): ${rvolStr} of normal daily volume

RECENT NEWS (last 6 hours):
${newsSummary}

TASK: Identify the PRIMARY catalyst for today's ${direction}ward move.

Rules:
1. Be specific – mention actual numbers, company names, or events from the news if relevant
2. If news directly explains the move, prioritize it over technical factors
3. If Z-score is very high (>3.5) or very low (<-3.5), stress the statistical extremity
4. Keep the "reason" field to 1 concise sentence (max 120 chars)
5. isSbcAlert = true ONLY for blowout earnings, FDA approval, major acquisition, or critical guidance raise

Return strictly valid JSON:
{
  "reason": "1-sentence specific analytical reason",
  "category": "Earnings|Guidance|M&A|Macro|Legal|Product|Technical|Sector",
  "socialCopy": "Catchy 160-char post with $${symbol} and relevant hashtags",
  "isSbcAlert": false,
  "aiConfidence": 85
}`.trim();

            const insight = await this.callLLM(prompt);
            // If LLM fails (no API key, timeout, etc.), fall back to smart fallback
            return insight ?? this.buildNoNewsFallback(symbol, direction, changePctStr, zStr, rvolStr, sector);

        } catch (error) {
            console.error(`❌ AiMoversService: Error for ${symbol}:`, error);
            // Return smart fallback instead of null so we always have something
            return this.buildNoNewsFallback(symbol, direction, changePctStr, zStr, rvolStr, sector);
        }
    }

    /**
     * Smart fallback when no news is available – uses quantitative data to
     * construct a meaningful reason instead of a generic placeholder.
     */
    private buildNoNewsFallback(
        symbol: string,
        direction: string,
        changePctStr: string,
        zStr: string,
        rvolStr: string,
        sector: string | null
    ): MoverInsight {
        const absZ = Math.abs(parseFloat(zStr) || 0);
        const highRvol = parseFloat(rvolStr) >= 2;

        let reason: string;
        let category = 'Technical';
        let aiConfidence = 55;

        if (absZ >= 4.0) {
            reason = `Extreme ${direction}ward move of ${changePctStr} (Z: ${zStr}) with no public news catalyst – possible institutional activity or halt.`;
            aiConfidence = 50;
        } else if (highRvol) {
            reason = `${changePctStr} on ${rvolStr} relative volume with no immediate news – elevated institutional interest in ${sector || 'sector'}.`;
            category = 'Technical';
            aiConfidence = 60;
        } else {
            reason = `${changePctStr} statistical outlier (Z: ${zStr}) driven by broader ${sector || 'market'} sentiment without specific news catalyst.`;
            aiConfidence = 55;
        }

        return {
            symbol,
            reason,
            category,
            socialCopy: `👀 $${symbol} ${direction === 'up' ? '📈' : '📉'} ${changePctStr} on ${rvolStr} relative volume. Statistical outlier (Z: ${zStr}). Watch closely. #Stocks #${sector?.replace(/\s/g, '') || 'Market'}`,
            isSbcAlert: false,
            aiConfidence,
        };
    }

    /**
     * Call LLM (Gemini preferred, OpenAI fallback)
     */
    private async callLLM(prompt: string): Promise<MoverInsight | null> {
        const geminiKey = process.env.GEMINI_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        if (geminiKey) {
            return this.callGemini(prompt, geminiKey);
        } else if (openaiKey) {
            return this.callOpenAI(prompt, openaiKey);
        }

        console.warn('⚠️ AiMoversService: No LLM API key configured');
        return null; // Return null – caller will use buildNoNewsFallback via error path
    }

    private async callGemini(prompt: string, apiKey: string): Promise<MoverInsight | null> {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.15, response_mime_type: "application/json" }
                })
            });

            if (!response.ok) throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return null;

            const parsed = JSON.parse(text);
            return { symbol: '', ...parsed };
        } catch (error) {
            console.error('AiMoversService: Gemini error:', error);
            return null;
        }
    }

    private async callOpenAI(prompt: string, apiKey: string): Promise<MoverInsight | null> {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert financial analyst. Always respond with valid JSON only, no markdown, no explanations outside the JSON.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.15,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) return null;

            const parsed = JSON.parse(text);
            return { symbol: '', ...parsed };
        } catch (error) {
            console.error('AiMoversService: OpenAI error:', error);
            return null;
        }
    }
}

export const aiMoversService = new AiMoversService();
