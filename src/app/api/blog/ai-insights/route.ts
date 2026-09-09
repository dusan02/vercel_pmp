import { NextRequest, NextResponse } from 'next/server';
import { getCachedData } from '@/lib/redis';

interface MarketData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
}

// OpenAI integration (optional - requires API key)
async function generateAIInsights(marketData: MarketData[]): Promise<string> {
  try {
    // Check if OpenAI API key is available
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return generateBasicInsights(marketData);
    }

    // Prepare market summary for AI
    const topGainers = marketData
      .filter(stock => stock.percentChange > 0)
      .sort((a, b) => b.percentChange - a.percentChange)
      .slice(0, 5);

    const topLosers = marketData
      .filter(stock => stock.percentChange < 0)
      .sort((a, b) => a.percentChange - b.percentChange)
      .slice(0, 5);

    const marketSummary = {
      total_stocks: marketData.length,
      gainers: marketData.filter(s => s.percentChange > 0).length,
      losers: marketData.filter(s => s.percentChange < 0).length,
      avg_change: marketData.reduce((sum, s) => sum + s.percentChange, 0) / marketData.length,
      total_market_cap_change: marketData.reduce((sum, s) => sum + s.marketCapDiff, 0),
      top_gainers: topGainers.map(s => `${s.ticker}: +${s.percentChange.toFixed(2)}%`),
      top_losers: topLosers.map(s => `${s.ticker}: ${s.percentChange.toFixed(2)}%`),
      volatile_stocks: marketData.filter(s => Math.abs(s.percentChange) > 3).length
    };

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'system',
          content: 'You are a financial analyst providing brief, insightful commentary on pre-market stock movements. Keep insights concise, professional, and factual. Focus on trends, notable movers, and potential market implications.'
        }, {
          role: 'user',
          content: `Analyze this pre-market data and provide 3-4 key insights (2-3 sentences each): ${JSON.stringify(marketSummary)}`
        }],
        max_tokens: 300,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.warn('OpenAI API error:', response.status);
      return generateBasicInsights(marketData);
    }

    const aiResponse = await response.json();
    return aiResponse.choices?.[0]?.message?.content || generateBasicInsights(marketData);

  } catch (error) {
    console.error('AI insights generation error:', error);
    return generateBasicInsights(marketData);
  }
}

// Fallback insights without AI
function generateBasicInsights(marketData: MarketData[]): string {
  const gainers = marketData.filter(s => s.percentChange > 0).length;
  const losers = marketData.filter(s => s.percentChange < 0).length;
  const avgChange = marketData.reduce((sum, s) => sum + s.percentChange, 0) / marketData.length;
  const volatileStocks = marketData.filter(s => Math.abs(s.percentChange) > 3).length;

  const topGainer = marketData
    .filter(s => s.percentChange > 0)
    .sort((a, b) => b.percentChange - a.percentChange)[0];

  const topLoser = marketData
    .filter(s => s.percentChange < 0)
    .sort((a, b) => a.percentChange - b.percentChange)[0];

  let sentiment = 'Mixed';
  if (gainers > losers * 1.5) sentiment = 'Bullish';
  else if (losers > gainers * 1.5) sentiment = 'Bearish';

  return `
**Market Sentiment:** ${sentiment} with ${gainers} gainers vs ${losers} losers (${((gainers / marketData.length) * 100).toFixed(1)}% advancing).

**Volatility Alert:** ${volatileStocks} stocks showing significant movement (>3%), suggesting active pre-market trading and potential news catalysts.

**Top Performer:** ${topGainer ? `${topGainer.ticker} leads with +${topGainer.percentChange.toFixed(2)}% gain` : 'No significant gainers'}, while ${topLoser ? `${topLoser.ticker} declined ${topLoser.percentChange.toFixed(2)}%` : 'minimal losses observed'}.

**Market Average:** Overall pre-market movement of ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}% indicates ${Math.abs(avgChange) > 0.5 ? 'significant directional bias' : 'relatively stable conditions'}.
  `.trim();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    // Get cached stock data
    const cachedData = await getCachedData('stock_data');

    if (!cachedData) {
      return NextResponse.json({ error: 'No stock data available' }, { status: 404 });
    }

    const stocksData: MarketData[] = Object.values(cachedData);

    if (stocksData.length === 0) {
      return NextResponse.json({ error: 'No stock data found' }, { status: 404 });
    }

    // Generate AI insights
    const insights = await generateAIInsights(stocksData);

    // Prepare market summary
    const summary = {
      total_stocks: stocksData.length,
      gainers: stocksData.filter(s => s.percentChange > 0).length,
      losers: stocksData.filter(s => s.percentChange < 0).length,
      avg_change: stocksData.reduce((sum, s) => sum + s.percentChange, 0) / stocksData.length,
      total_market_cap_change: stocksData.reduce((sum, s) => sum + s.marketCapDiff, 0),
      volatile_count: stocksData.filter(s => Math.abs(s.percentChange) > 3).length
    };

    const topMovers = {
      gainers: stocksData
        .filter(s => s.percentChange > 0)
        .sort((a, b) => b.percentChange - a.percentChange)
        .slice(0, 5),
      losers: stocksData
        .filter(s => s.percentChange < 0)
        .sort((a, b) => a.percentChange - b.percentChange)
        .slice(0, 5)
    };

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      insights,
      summary,
      top_movers: topMovers,
      ai_powered: !!process.env.OPENAI_API_KEY
    });

  } catch (error) {
    console.error('AI insights API error:', error);
    return NextResponse.json({
      error: 'Failed to generate AI insights',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    info: 'AI Insights API',
    description: 'Generate AI-powered market insights from current stock data',
    endpoints: {
      GET: '/api/blog/ai-insights - Get AI analysis of current market'
    },
    requirements: 'OPENAI_API_KEY environment variable for enhanced insights',
    fallback: 'Basic algorithmic insights when AI is unavailable'
  });
}