import { NextRequest, NextResponse } from 'next/server';
import { getCachedData } from '@/lib/redis';

interface BlogStockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  companyName?: string;
}

// Company name mapping for better readability
const COMPANY_NAMES: Record<string, string> = {
  'AAPL': 'Apple Inc.',
  'MSFT': 'Microsoft Corporation',
  'GOOGL': 'Alphabet Inc.',
  'AMZN': 'Amazon.com Inc.',
  'NVDA': 'NVIDIA Corporation',
  'META': 'Meta Platforms Inc.',
  'TSLA': 'Tesla Inc.',
  'BRK.B': 'Berkshire Hathaway',
  'LLY': 'Eli Lilly and Company',
  'JPM': 'JPMorgan Chase & Co.',
  'UNH': 'UnitedHealth Group',
  'V': 'Visa Inc.',
  'MA': 'Mastercard Inc.',
  'PG': 'Procter & Gamble',
  'HD': 'The Home Depot',
  'JNJ': 'Johnson & Johnson',
  'WMT': 'Walmart Inc.',
  'XOM': 'Exxon Mobil Corporation',
  'AVGO': 'Broadcom Inc.',
  'PFE': 'Pfizer Inc.'
};

function getCompanyName(ticker: string): string {
  return COMPANY_NAMES[ticker] || ticker;
}

function generateDailyReport(stocksData: BlogStockData[]): string {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Sort stocks by different criteria
  const topGainers = stocksData
    .filter(stock => stock.percentChange > 0)
    .sort((a, b) => b.percentChange - a.percentChange)
    .slice(0, 5);

  const topLosers = stocksData
    .filter(stock => stock.percentChange < 0)
    .sort((a, b) => a.percentChange - b.percentChange)
    .slice(0, 5);

  const biggestMarketCapGains = stocksData
    .filter(stock => stock.marketCapDiff > 0)
    .sort((a, b) => b.marketCapDiff - a.marketCapDiff)
    .slice(0, 5);

  const biggestMarketCapLosses = stocksData
    .filter(stock => stock.marketCapDiff < 0)
    .sort((a, b) => a.marketCapDiff - b.marketCapDiff)
    .slice(0, 5);

  // Calculate market overview
  const totalStocks = stocksData.length;
  const gainers = stocksData.filter(s => s.percentChange > 0).length;
  const losers = stocksData.filter(s => s.percentChange < 0).length;
  const unchanged = totalStocks - gainers - losers;

  const avgPercentChange = stocksData.reduce((sum, stock) => sum + stock.percentChange, 0) / totalStocks;
  const totalMarketCapChange = stocksData.reduce((sum, stock) => sum + stock.marketCapDiff, 0);

  // Generate HTML report
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Pre-Market Report - ${today}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 15px; line-height: 1.4; }
        .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
        .market-overview { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .section { margin-bottom: 20px; }
        .stock-list { display: grid; gap: 6px; }
        .stock-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; }
        .stock-info { flex: 1; }
        .ticker { font-weight: bold; color: #1e40af; margin-bottom: 2px; }
        .company-name { font-size: 0.85em; color: #64748b; line-height: 1.2; }
        .metrics { text-align: right; }
        .metrics > div { margin-bottom: 2px; }
        .metrics > div:last-child { margin-bottom: 0; }
        .positive { color: #059669; font-weight: 600; }
        .negative { color: #dc2626; font-weight: 600; }
        .neutral { color: #6b7280; }
        h1 { color: #1e293b; margin: 0 0 8px 0; font-size: 1.8em; }
        h2 { color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin: 0 0 12px 0; font-size: 1.3em; }
        .timestamp { color: #64748b; font-size: 0.9em; margin: 0; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
        .summary-card { background: white; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
        .big-number { font-size: 1.4em; font-weight: bold; margin-bottom: 4px; }
        ul { margin: 12px 0; padding-left: 20px; }
        li { margin-bottom: 6px; }
        .price-text { font-size: 0.9em; color: #374151; }
        .market-cap-text { font-size: 0.85em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Daily Pre-Market Report</h1>
        <p class="timestamp">${today} | Generated at ${new Date().toLocaleTimeString()}</p>
    </div>

    <div class="market-overview">
        <h2>📈 Market Overview</h2>
        <div class="summary-grid">
            <div class="summary-card">
                <div class="big-number positive">${gainers}</div>
                <div>Gainers</div>
            </div>
            <div class="summary-card">
                <div class="big-number negative">${losers}</div>
                <div>Losers</div>
            </div>
            <div class="summary-card">
                <div class="big-number neutral">${unchanged}</div>
                <div>Unchanged</div>
            </div>
            <div class="summary-card">
                <div class="big-number ${avgPercentChange >= 0 ? 'positive' : 'negative'}">
                    ${avgPercentChange >= 0 ? '+' : ''}${avgPercentChange.toFixed(2)}%
                </div>
                <div>Avg. Change</div>
            </div>
        </div>
        <p><strong>Total Market Cap Change:</strong> 
           <span class="${totalMarketCapChange >= 0 ? 'positive' : 'negative'}">
               ${totalMarketCapChange >= 0 ? '+' : ''}$${totalMarketCapChange.toFixed(2)}B
           </span>
        </p>
    </div>

    <div class="section">
        <h2>🚀 Top Gainers by Percentage</h2>
        <div class="stock-list">
            ${topGainers.map(stock => `
                <div class="stock-item">
                    <div class="stock-info">
                        <div class="ticker">${stock.ticker}</div>
                        <div class="company-name">${getCompanyName(stock.ticker)}</div>
                    </div>
                    <div class="metrics">
                        <div class="positive">+${stock.percentChange.toFixed(2)}%</div>
                        <div class="price-text">$${stock.currentPrice.toFixed(2)}</div>
                        <div class="positive market-cap-text">+$${stock.marketCapDiff.toFixed(2)}B</div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h2>📉 Top Losers by Percentage</h2>
        <div class="stock-list">
            ${topLosers.map(stock => `
                <div class="stock-item">
                    <div class="stock-info">
                        <div class="ticker">${stock.ticker}</div>
                        <div class="company-name">${getCompanyName(stock.ticker)}</div>
                    </div>
                    <div class="metrics">
                        <div class="negative">${stock.percentChange.toFixed(2)}%</div>
                        <div class="price-text">$${stock.currentPrice.toFixed(2)}</div>
                        <div class="negative market-cap-text">$${stock.marketCapDiff.toFixed(2)}B</div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h2>💰 Biggest Market Cap Gains</h2>
        <div class="stock-list">
            ${biggestMarketCapGains.map(stock => `
                <div class="stock-item">
                    <div class="stock-info">
                        <div class="ticker">${stock.ticker}</div>
                        <div class="company-name">${getCompanyName(stock.ticker)}</div>
                    </div>
                    <div class="metrics">
                        <div class="positive">+${stock.percentChange.toFixed(2)}%</div>
                        <div class="price-text">$${stock.currentPrice.toFixed(2)}</div>
                        <div class="positive market-cap-text">+$${stock.marketCapDiff.toFixed(2)}B</div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h2>📉 Biggest Market Cap Losses</h2>
        <div class="stock-list">
            ${biggestMarketCapLosses.map(stock => `
                <div class="stock-item">
                    <div class="stock-info">
                        <div class="ticker">${stock.ticker}</div>
                        <div class="company-name">${getCompanyName(stock.ticker)}</div>
                    </div>
                    <div class="metrics">
                        <div class="negative">${stock.percentChange.toFixed(2)}%</div>
                        <div class="price-text">$${stock.currentPrice.toFixed(2)}</div>
                        <div class="negative market-cap-text">$${stock.marketCapDiff.toFixed(2)}B</div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h2>📊 Key Insights</h2>
        <ul>
            <li><strong>Market Sentiment:</strong> ${gainers > losers ? 'Bullish' : gainers < losers ? 'Bearish' : 'Mixed'} 
                (${((gainers / totalStocks) * 100).toFixed(1)}% stocks gained)</li>
            <li><strong>Volatility:</strong> ${stocksData.filter(s => Math.abs(s.percentChange) > 2).length} stocks moved >2%</li>
            <li><strong>Market Cap Leaders:</strong> ${biggestMarketCapGains[0]?.ticker || 'N/A'} leads gains (+$${biggestMarketCapGains[0]?.marketCapDiff.toFixed(2) || '0'}B), ${biggestMarketCapLosses[0]?.ticker || 'N/A'} leads losses ($${biggestMarketCapLosses[0]?.marketCapDiff.toFixed(2) || '0'}B)</li>
        </ul>
    </div>

    <footer style="text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.9em;">
        <p style="margin: 0 0 8px 0;">Generated by <strong>PreMarketPrice.com</strong> | Data from Polygon.io</p>
        <p style="margin: 0; font-style: italic; font-size: 0.85em;">This report is for informational purposes only and should not be considered investment advice.</p>
    </footer>
</body>
</html>
  `;

  return html;
}

export async function GET(request: NextRequest) {
  try {
    // Get cached stock data
    const cachedData = await getCachedData('stock_data');
    
    if (!cachedData) {
      return NextResponse.json({ error: 'No stock data available' }, { status: 404 });
    }

    const stocksData: BlogStockData[] = Object.values(cachedData);
    
    if (stocksData.length === 0) {
      return NextResponse.json({ error: 'No stock data found' }, { status: 404 });
    }

    // Check if we want HTML or JSON response
    const format = request.nextUrl.searchParams.get('format') || 'html';
    
    if (format === 'json') {
      // Return raw data for API consumption
      return NextResponse.json({
        generated_at: new Date().toISOString(),
        market_overview: {
          total_stocks: stocksData.length,
          gainers: stocksData.filter(s => s.percentChange > 0).length,
          losers: stocksData.filter(s => s.percentChange < 0).length,
          avg_change: stocksData.reduce((sum, s) => sum + s.percentChange, 0) / stocksData.length,
          total_market_cap_change: stocksData.reduce((sum, s) => sum + s.marketCapDiff, 0)
        },
        top_gainers: stocksData
          .filter(s => s.percentChange > 0)
          .sort((a, b) => b.percentChange - a.percentChange)
          .slice(0, 10),
        top_losers: stocksData
          .filter(s => s.percentChange < 0)
          .sort((a, b) => a.percentChange - b.percentChange)
          .slice(0, 10)
      });
    }

    // Generate HTML report
    const htmlReport = generateDailyReport(stocksData);
    
    return new NextResponse(htmlReport, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    });

  } catch (error) {
    console.error('Daily report generation error:', error);
    return NextResponse.json({ error: 'Failed to generate daily report' }, { status: 500 });
  }
}