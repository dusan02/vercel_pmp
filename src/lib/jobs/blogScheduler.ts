// Automatic blog report scheduler
import { redisClient } from '../redis/client';
import { getCachedData } from '../redis/operations';

interface ScheduledBlogConfig {
  enabled: boolean;
  scheduleTimes: string[]; // Array of times in HH:MM format
  webhookUrl?: string; // Optional webhook for publishing
  saveToFile?: boolean;
  aiEnhanced?: boolean;
}

class BlogScheduler {
  private config: ScheduledBlogConfig;
  private intervals: NodeJS.Timeout[] = [];

  constructor(config: ScheduledBlogConfig) {
    this.config = config;
  }

  start() {
    if (!this.config.enabled) {
      console.log('📝 Blog scheduler is disabled');
      return;
    }

    console.log('📝 Starting blog scheduler...');

    // Schedule reports for each specified time
    this.config.scheduleTimes.forEach(time => {
      this.scheduleDaily(time);
    });
  }

  stop() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    console.log('📝 Blog scheduler stopped');
  }

  private scheduleDaily(timeString: string) {
    const parts = timeString.split(':');
    const hours = parts[0] ? Number(parts[0]) : 0;
    const minutes = parts[1] ? Number(parts[1]) : 0;

    const scheduleNext = () => {
      const now = new Date();
      const scheduled = new Date();
      scheduled.setHours(hours, minutes, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
      }

      const msUntilScheduled = scheduled.getTime() - now.getTime();

      console.log(`📝 Next blog report scheduled for ${scheduled.toLocaleString()}`);

      const timeout = setTimeout(async () => {
        await this.generateAndPublishReport();
        scheduleNext(); // Schedule next day
      }, msUntilScheduled);

      this.intervals.push(timeout);
    };

    scheduleNext();
  }

  private async generateAndPublishReport(): Promise<void> {
    try {
      console.log('📝 Generating daily blog report...');

      // Check if market data is available
      const cachedData = await getCachedData('stock_data');
      if (!cachedData) {
        console.warn('📝 No stock data available for blog report');
        return;
      }

      // Generate report via internal API call
      const reportUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/blog/daily-report`;

      if (this.config.saveToFile) {
        await this.saveReportToFile(reportUrl);
      }

      if (this.config.webhookUrl) {
        await this.publishToWebhook(reportUrl);
      }

      // AI Enhancement (if enabled)
      if (this.config.aiEnhanced) {
        await this.generateAIInsights();
      }

      console.log('✅ Daily blog report generated successfully');

    } catch (error) {
      console.error('❌ Failed to generate daily blog report:', error);
    }
  }

  private async saveReportToFile(reportUrl: string): Promise<void> {
    try {
      const response = await fetch(reportUrl);
      const html = await response.text();

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `public/blog/daily-report-${timestamp}.html`;

      // In a real implementation, you'd use fs to save the file
      // For now, just log the intent
      console.log(`📝 Would save report to: ${filename}`);

    } catch (error) {
      console.error('❌ Failed to save report to file:', error);
    }
  }

  private async publishToWebhook(reportUrl: string): Promise<void> {
    try {
      if (!this.config.webhookUrl) return;

      const response = await fetch(reportUrl + '?format=json');
      const reportData = await response.json();

      // Send to webhook (could be WordPress, Ghost, etc.)
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `Daily Pre-Market Report - ${new Date().toLocaleDateString()}`,
          content: await this.generateMarkdownContent(reportData),
          status: 'publish',
          categories: ['market-analysis', 'pre-market', 'daily-report'],
          tags: ['stocks', 'trading', 'market-movers'],
          author: 'PreMarketPrice Bot'
        })
      });

      console.log('📝 Report published to webhook');

    } catch (error) {
      console.error('❌ Failed to publish to webhook:', error);
    }
  }

  private async generateMarkdownContent(reportData: any): Promise<string> {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
# 📊 Daily Pre-Market Report - ${date}

## Market Overview

- **Gainers:** ${reportData.market_overview.gainers}
- **Losers:** ${reportData.market_overview.losers}  
- **Average Change:** ${reportData.market_overview.avg_change.toFixed(2)}%
- **Total Market Cap Change:** $${reportData.market_overview.total_market_cap_change.toFixed(2)}B

## 🚀 Top Gainers

${reportData.top_gainers.slice(0, 5).map((stock: any) =>
      `- **${stock.ticker}**: +${stock.percentChange.toFixed(2)}% ($${stock.currentPrice.toFixed(2)})`
    ).join('\n')}

## 📉 Top Losers

${reportData.top_losers.slice(0, 5).map((stock: any) =>
      `- **${stock.ticker}**: ${stock.percentChange.toFixed(2)}% ($${stock.currentPrice.toFixed(2)})`
    ).join('\n')}

## Key Insights

- Market sentiment appears **${reportData.market_overview.gainers > reportData.market_overview.losers ? 'bullish' : 'bearish'}**
- ${reportData.market_overview.gainers} stocks gained vs ${reportData.market_overview.losers} stocks declined
- Generated by [PreMarketPrice.com](https://premarketprice.com)

*Data provided by Polygon.io. This report is for informational purposes only.*
    `;
  }

  private async generateAIInsights(): Promise<void> {
    // This would integrate with OpenAI API for enhanced insights
    console.log('🤖 AI insights generation would happen here');

    // Example implementation:
    /*
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "user",
        content: `Analyze this market data and provide insights: ${JSON.stringify(stockData)}`
      }],
      max_tokens: 200
    });
    
    const insights = completion.choices[0].message.content;
    // Add insights to report
    */
  }

  // Manual trigger for testing
  async triggerNow(): Promise<void> {
    console.log('📝 Manually triggering blog report generation...');
    await this.generateAndPublishReport();
  }
}

// Export singleton instance
export const blogScheduler = new BlogScheduler({
  enabled: true,
  scheduleTimes: ['06:00', '15:30'], // 6 AM pre-market, 3:30 PM post-market
  saveToFile: true,
  aiEnhanced: false, // Enable when OpenAI key is available
  // webhookUrl: 'https://your-wordpress-site.com/wp-json/wp/v2/posts' // Uncomment to enable
});

export default BlogScheduler;