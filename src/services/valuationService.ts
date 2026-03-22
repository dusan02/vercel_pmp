import { prisma } from '@/lib/db/prisma';

export interface ValuationDataPoint {
  date: Date;
  value: number;
  percentile?: number | null;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  period: 'monthly' | 'daily';
}

export interface PercentileStats {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
  stdDev: number;
  sampleSize: number;
}

export class ValuationService {
  private static readonly METRICS = ['pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda'] as const;
  private static readonly PERIODS = ['10y', '5y', '1y', '6m', '3m', '1m'] as const;

  /**
   * Získanie grafových dát pre vizualizáciu
   */
  static async getChartData(
    symbol: string, 
    metric: 'pe_ratio' | 'pb_ratio' | 'ps_ratio' | 'ev_ebitda',
    period: '10y' | '5y' | '1y' = '10y'
  ): Promise<ValuationDataPoint[]> {
    const endDate = new Date();
    const startDate = this.getStartDate(period, endDate);
    
    // Získanie percentilových štatistík
    const percentiles = await prisma.valuationPercentiles.findFirst({
      where: { symbol, metric, period }
    });
    
    if (!percentiles) {
      throw new Error(`No percentile data found for ${symbol} ${metric} ${period}`);
    }
    
    // Získanie historických dát
    const history = await prisma.valuationHistory.findMany({
      where: {
        symbol,
        metric,
        date: { gte: startDate, lte: endDate },
        period: period === '1y' ? 'daily' : 'monthly'
      },
      orderBy: { date: 'asc' }
    });
    
    // Spojenie dát s percentilmi
    return history.map(point => ({
      date: point.date,
      value: point.value,
      percentile: point.percentile,
      p10: percentiles.p10,
      p25: percentiles.p25,
      p50: percentiles.p50,
      p75: percentiles.p75,
      p90: percentiles.p90,
      period: point.period as 'monthly' | 'daily'
    }));
  }

  /**
   * Vytvorenie demo dát pre testovanie (nahradí reálny zber dát)
   */
  static async generateDemoData(symbol: string): Promise<void> {
    console.log(`📊 Generating demo valuation data for ${symbol}`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 10);
    
    const demoData: Array<{
      date: Date;
      metric: string;
      value: number;
      period: 'monthly' | 'daily';
    }> = [];
    
    // Generovanie mesačných dát
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const baseValues = {
        pe_ratio: 15 + Math.random() * 25,
        pb_ratio: 2 + Math.random() * 8,
        ps_ratio: 3 + Math.random() * 12,
        ev_ebitda: 8 + Math.random() * 20
      };
      
      for (const metric of this.METRICS) {
        let value = baseValues[metric];
        
        // Pridanie trendu a sezónnosti
        const yearProgress = (currentDate.getMonth() / 12);
        const trend = Math.sin(yearProgress * Math.PI * 2) * 0.2 + 1;
        value *= trend;
        
        // Pridanie náhodného šumu
        value += (Math.random() - 0.5) * 2;
        
        demoData.push({
          date: new Date(currentDate),
          metric,
          value: Math.max(0.1, value),
          period: 'monthly'
        });
      }
      
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    // Generovanie denných dát pre posledný mesiac
    const lastMonth = new Date(endDate);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    currentDate = new Date(lastMonth);
    while (currentDate <= endDate) {
      for (const metric of this.METRICS) {
        const baseValue = 10 + Math.random() * 30;
        const noise = (Math.random() - 0.5) * 4;
        
        demoData.push({
          date: new Date(currentDate),
          metric,
          value: Math.max(0.1, baseValue + noise),
          period: 'daily'
        });
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Uloženie do databázy
    for (const point of demoData) {
      await prisma.valuationHistory.upsert({
        where: {
          symbol_date_metric_period: {
            symbol,
            date: point.date,
            metric: point.metric,
            period: point.period
          }
        },
        update: { value: point.value },
        create: {
          symbol,
          date: point.date,
          metric: point.metric,
          value: point.value,
          period: point.period
        }
      });
    }
    
    // Výpočet percentilov
    await this.calculatePercentiles(symbol);
    
    console.log(`✅ Demo data generated for ${symbol}`);
  }

  /**
   * Výpočet percentilov
   */
  static async calculatePercentiles(symbol: string): Promise<void> {
    console.log(`📈 Calculating percentiles for ${symbol}`);
    
    for (const metric of this.METRICS) {
      for (const period of this.PERIODS) {
        const stats = await this.calculatePercentileStats(symbol, metric, period);
        if (stats) {
          await this.savePercentileStats(symbol, metric, period, stats);
        }
      }
    }
    
    console.log(`✅ Percentiles calculated for ${symbol}`);
  }

  /**
   * Výpočet percentilových štatistík
   */
  private static async calculatePercentileStats(
    symbol: string,
    metric: string,
    period: string
  ): Promise<PercentileStats | null> {
    const startDate = this.getStartDate(period as any, new Date());
    
    const values = await prisma.valuationHistory.findMany({
      where: {
        symbol,
        metric,
        date: { gte: startDate },
        period: period === '1y' ? 'daily' : 'monthly'
      },
      select: { value: true }
    });
    
    if (values.length < 10) {
      return null;
    }
    
    const sortedValues = values.map(v => v.value).sort((a, b) => a - b);
    const n = sortedValues.length;
    
    const calculatePercentile = (p: number) => {
      const index = Math.ceil((p / 100) * n) - 1;
      return sortedValues[Math.max(0, Math.min(index, n - 1))];
    };
    
    const mean = sortedValues.reduce((sum, val) => sum + val, 0) / n;
    const variance = sortedValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    return {
      p10: calculatePercentile(10) || 0,
      p25: calculatePercentile(25) || 0,
      p50: calculatePercentile(50) || 0,
      p75: calculatePercentile(75) || 0,
      p90: calculatePercentile(90) || 0,
      mean,
      stdDev,
      sampleSize: n
    };
  }

  /**
   * Uloženie percentilových štatistík
   */
  private static async savePercentileStats(
    symbol: string,
    metric: string,
    period: string,
    stats: PercentileStats
  ): Promise<void> {
    await prisma.valuationPercentiles.upsert({
      where: { symbol_metric_period: { symbol, metric, period } },
      update: {
        p10: stats.p10,
        p25: stats.p25,
        p50: stats.p50,
        p75: stats.p75,
        p90: stats.p90,
        mean: stats.mean,
        stdDev: stats.stdDev,
        sampleSize: stats.sampleSize,
        lastUpdated: new Date()
      },
      create: {
        symbol,
        metric,
        period,
        p10: stats.p10,
        p25: stats.p25,
        p50: stats.p50,
        p75: stats.p75,
        p90: stats.p90,
        mean: stats.mean,
        stdDev: stats.stdDev,
        sampleSize: stats.sampleSize
      }
    });
  }

  /**
   * Pomocná funkcia pre získanie počiatočného dátumu
   */
  private static getStartDate(period: '10y' | '5y' | '1y' | '6m' | '3m' | '1m', endDate: Date): Date {
    const startDate = new Date(endDate);
    
    switch (period) {
      case '10y':
        startDate.setFullYear(endDate.getFullYear() - 10);
        break;
      case '5y':
        startDate.setFullYear(endDate.getFullYear() - 5);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case '6m':
        startDate.setMonth(endDate.getMonth() - 6);
        break;
      case '3m':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case '1m':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
    }
    
    return startDate;
  }
}
