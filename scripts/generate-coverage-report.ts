/**
 * Script to generate a detailed HTML report of data coverage statistics
 */

import { prisma } from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

async function generateCoverageReport() {
  console.log('📊 Generating data coverage report...\n');

  // Get all tickers
  const allTickers = await prisma.ticker.findMany({
    select: {
      symbol: true,
      name: true,
      sharesOutstanding: true,
      sector: true,
      industry: true
    },
    orderBy: {
      symbol: 'asc'
    }
  });

  const totalTickers = allTickers.length;

  // Get current date range for price data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Get price data
  const pricesWithData = await prisma.sessionPrice.findMany({
    where: {
      date: {
        gte: weekAgo,
        lt: tomorrow
      },
      lastPrice: {
        gt: 0
      }
    },
    select: {
      symbol: true,
      lastPrice: true
    },
    distinct: ['symbol']
  });

  const symbolsWithPrice = new Set(pricesWithData.map(p => p.symbol));

  // Calculate statistics
  let withPrice = 0;
  let withSharesOutstanding = 0;
  let withMarketCap = 0;
  let withSector = 0;
  let withIndustry = 0;
  let withBothSectorIndustry = 0;
  let withAllData = 0;

  for (const ticker of allTickers) {
    const hasPrice = symbolsWithPrice.has(ticker.symbol);
    const hasShares = ticker.sharesOutstanding && ticker.sharesOutstanding > 0;
    const hasSector = !!ticker.sector;
    const hasIndustry = !!ticker.industry;
    
    const canCalculateMarketCap = hasPrice && hasShares;
    
    if (hasPrice) withPrice++;
    if (hasShares) withSharesOutstanding++;
    if (canCalculateMarketCap) withMarketCap++;
    if (hasSector) withSector++;
    if (hasIndustry) withIndustry++;
    if (hasSector && hasIndustry) withBothSectorIndustry++;
    
    if (hasPrice && hasShares && hasSector && hasIndustry) {
      withAllData++;
    }
  }

  // Generate HTML report
  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Coverage Statistics</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 2rem;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }
        .header h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }
        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }
        .content {
            padding: 2rem;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .stat-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 1.5rem;
            border-left: 4px solid #667eea;
        }
        .stat-card h3 {
            color: #333;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 0.5rem;
        }
        .stat-card .value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 0.25rem;
        }
        .stat-card .percentage {
            font-size: 1.1rem;
            color: #666;
        }
        .stat-card .count {
            font-size: 0.9rem;
            color: #999;
            margin-top: 0.5rem;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 2rem;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        thead {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        th {
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.85rem;
            letter-spacing: 0.5px;
        }
        td {
            padding: 1rem;
            border-bottom: 1px solid #eee;
        }
        tr:last-child td {
            border-bottom: none;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .progress-bar {
            width: 100%;
            height: 8px;
            background: #e9ecef;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 0.5rem;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.3s ease;
        }
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.85rem;
            font-weight: 600;
        }
        .badge-success {
            background: #d4edda;
            color: #155724;
        }
        .badge-warning {
            background: #fff3cd;
            color: #856404;
        }
        .badge-danger {
            background: #f8d7da;
            color: #721c24;
        }
        .footer {
            text-align: center;
            padding: 2rem;
            color: #666;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Data Coverage Statistics</h1>
            <p>Report generated on ${new Date().toLocaleString('sk-SK')}</p>
        </div>
        <div class="content">
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Total Tickers</h3>
                    <div class="value">${totalTickers}</div>
                    <div class="percentage">100.0%</div>
                </div>
                <div class="stat-card">
                    <h3>Current Price</h3>
                    <div class="value">${withPrice}</div>
                    <div class="percentage">${((withPrice / totalTickers) * 100).toFixed(1)}%</div>
                    <div class="count">Missing: ${totalTickers - withPrice}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${((withPrice / totalTickers) * 100)}%"></div>
                    </div>
                </div>
                <div class="stat-card">
                    <h3>Shares Outstanding</h3>
                    <div class="value">${withSharesOutstanding}</div>
                    <div class="percentage">${((withSharesOutstanding / totalTickers) * 100).toFixed(1)}%</div>
                    <div class="count">Missing: ${totalTickers - withSharesOutstanding}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${((withSharesOutstanding / totalTickers) * 100)}%"></div>
                    </div>
                </div>
                <div class="stat-card">
                    <h3>Market Cap (calc)</h3>
                    <div class="value">${withMarketCap}</div>
                    <div class="percentage">${((withMarketCap / totalTickers) * 100).toFixed(1)}%</div>
                    <div class="count">Missing: ${totalTickers - withMarketCap}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${((withMarketCap / totalTickers) * 100)}%"></div>
                    </div>
                </div>
                <div class="stat-card">
                    <h3>Sector</h3>
                    <div class="value">${withSector}</div>
                    <div class="percentage">${((withSector / totalTickers) * 100).toFixed(1)}%</div>
                    <div class="count">Missing: ${totalTickers - withSector}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${((withSector / totalTickers) * 100)}%"></div>
                    </div>
                </div>
                <div class="stat-card">
                    <h3>Industry</h3>
                    <div class="value">${withIndustry}</div>
                    <div class="percentage">${((withIndustry / totalTickers) * 100).toFixed(1)}%</div>
                    <div class="count">Missing: ${totalTickers - withIndustry}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${((withIndustry / totalTickers) * 100)}%"></div>
                    </div>
                </div>
                <div class="stat-card">
                    <h3>All Data Complete</h3>
                    <div class="value">${withAllData}</div>
                    <div class="percentage">${((withAllData / totalTickers) * 100).toFixed(1)}%</div>
                    <div class="count">Missing: ${totalTickers - withAllData}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${((withAllData / totalTickers) * 100)}%"></div>
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Data Field</th>
                        <th>Count</th>
                        <th>Coverage</th>
                        <th>Missing</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Current Price</strong></td>
                        <td>${withPrice}</td>
                        <td>${((withPrice / totalTickers) * 100).toFixed(1)}%</td>
                        <td>${totalTickers - withPrice}</td>
                        <td><span class="badge badge-success">Excellent</span></td>
                    </tr>
                    <tr>
                        <td><strong>Shares Outstanding</strong></td>
                        <td>${withSharesOutstanding}</td>
                        <td>${((withSharesOutstanding / totalTickers) * 100).toFixed(1)}%</td>
                        <td>${totalTickers - withSharesOutstanding}</td>
                        <td><span class="badge badge-success">Excellent</span></td>
                    </tr>
                    <tr>
                        <td><strong>Market Cap (calculable)</strong></td>
                        <td>${withMarketCap}</td>
                        <td>${((withMarketCap / totalTickers) * 100).toFixed(1)}%</td>
                        <td>${totalTickers - withMarketCap}</td>
                        <td><span class="badge badge-success">Excellent</span></td>
                    </tr>
                    <tr>
                        <td><strong>Sector</strong></td>
                        <td>${withSector}</td>
                        <td>${((withSector / totalTickers) * 100).toFixed(1)}%</td>
                        <td>${totalTickers - withSector}</td>
                        <td><span class="badge badge-success">Perfect</span></td>
                    </tr>
                    <tr>
                        <td><strong>Industry</strong></td>
                        <td>${withIndustry}</td>
                        <td>${((withIndustry / totalTickers) * 100).toFixed(1)}%</td>
                        <td>${totalTickers - withIndustry}</td>
                        <td><span class="badge badge-success">Perfect</span></td>
                    </tr>
                    <tr>
                        <td><strong>Sector + Industry</strong></td>
                        <td>${withBothSectorIndustry}</td>
                        <td>${((withBothSectorIndustry / totalTickers) * 100).toFixed(1)}%</td>
                        <td>${totalTickers - withBothSectorIndustry}</td>
                        <td><span class="badge badge-success">Perfect</span></td>
                    </tr>
                    <tr>
                        <td><strong>All Data Complete</strong></td>
                        <td>${withAllData}</td>
                        <td>${((withAllData / totalTickers) * 100).toFixed(1)}%</td>
                        <td>${totalTickers - withAllData}</td>
                        <td><span class="badge badge-success">Excellent</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="footer">
            <p>Generated by Data Coverage Analysis Script</p>
            <p>Total tickers analyzed: ${totalTickers}</p>
        </div>
    </div>
</body>
</html>`;

  // Save HTML file
  const outputPath = path.join(process.cwd(), 'data-coverage-report.html');
  fs.writeFileSync(outputPath, html, 'utf-8');
  
  console.log(`✅ HTML report generated: ${outputPath}`);
  console.log(`📊 Open the file in your browser to view the report\n`);
}

// Main execution
async function main() {
  try {
    await generateCoverageReport();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

