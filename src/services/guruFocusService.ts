import { prisma } from '@/lib/db/prisma';

export interface GuruFocusMetrics {
  peRatio?: number;
  psRatio?: number;
  pbRatio?: number;
  evEbitda?: number;
  fcfYield?: number;
  evRevenue?: number;
  evFcf?: number;
  priceTangibleBook?: number;
  pegRatio?: number;
  dividendYield?: number;
  roic?: number;
  roe?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
}

export interface GuruFocusChartData {
  date: Date;
  value: number;
  median?: number | undefined;
  percentile10?: number | undefined;
  percentile90?: number | undefined;
  isExpensive?: boolean;
  isCheap?: boolean;
}

export class GuruFocusService {
  private static readonly VALUATION_METRICS = [
    'peRatio', 'psRatio', 'pbRatio', 'evEbitda', 'fcfYield',
    'evRevenue', 'evFcf', 'priceTangibleBook', 'pegRatio', 'dividendYield'
  ] as const;

  /**
   * Jednoduchý výpočet demo metrík pre testovanie
   */
  static async calculateGuruFocusMetrics(symbol: string, date: Date): Promise<GuruFocusMetrics> {
    // Získanie základných dát
    const [ticker, financial, dailyValuation] = await Promise.all([
      prisma.ticker.findUnique({
        where: { symbol },
        select: { sharesOutstanding: true }
      }),
      prisma.financialStatement.findFirst({
        where: { 
          symbol, 
          endDate: { lte: date },
          period: { in: ['FY', 'Q4'] }
        },
        orderBy: { endDate: 'desc' }
      }),
      prisma.dailyValuationHistory.findFirst({
        where: { symbol, date },
        select: { closePrice: true, marketCap: true }
      })
    ]);

    const metrics: GuruFocusMetrics = {};

    // Demo hodnoty pre testovanie
    const baseValues = {
      peRatio: 15 + Math.random() * 20,
      psRatio: 3 + Math.random() * 8,
      pbRatio: 2 + Math.random() * 6,
      evEbitda: 10 + Math.random() * 15,
      fcfYield: 2 + Math.random() * 6,
      evRevenue: 4 + Math.random() * 10,
      evFcf: 12 + Math.random() * 18,
      priceTangibleBook: 3 + Math.random() * 7,
      pegRatio: 1 + Math.random() * 2,
      dividendYield: 1 + Math.random() * 4,
      roic: 8 + Math.random() * 20,
      roe: 10 + Math.random() * 25,
      debtToEquity: 0.3 + Math.random() * 1.5,
      currentRatio: 1.2 + Math.random() * 2,
      quickRatio: 0.8 + Math.random() * 1.5
    };

    // Pridanie nejakej logiky na základe skutočných dát
    if (dailyValuation?.closePrice && ticker?.sharesOutstanding) {
      // Reálne výpočty pre P/E, P/S atď. ak máme dáta
      const existingValuation = await prisma.dailyValuationHistory.findFirst({
        where: { symbol, date },
        select: { peRatio: true, psRatio: true, evEbitda: true, fcfYield: true }
      });

      if (existingValuation) {
        if (existingValuation.peRatio) metrics.peRatio = existingValuation.peRatio;
        if (existingValuation.psRatio) metrics.psRatio = existingValuation.psRatio;
        if (existingValuation.evEbitda) metrics.evEbitda = existingValuation.evEbitda;
        if (existingValuation.fcfYield) metrics.fcfYield = existingValuation.fcfYield;
      }

      // P/B Ratio výpočet
      if (financial?.totalEquity && ticker.sharesOutstanding) {
        const bookValuePerShare = financial.totalEquity / ticker.sharesOutstanding;
        metrics.pbRatio = dailyValuation.closePrice / bookValuePerShare;
      }
    }

    // Pre ostatné metriky použijeme demo hodnoty
    Object.keys(baseValues).forEach(key => {
      if (!metrics[key as keyof GuruFocusMetrics]) {
        metrics[key as keyof GuruFocusMetrics] = baseValues[key as keyof typeof baseValues];
      }
    });

    return metrics;
  }

  /**
   * Generovanie demo grafových dát
   */
  static async getGuruFocusChartData(
    symbol: string,
    metric: keyof GuruFocusMetrics,
    years: number = 10
  ): Promise<GuruFocusChartData[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - years);

    const chartData: GuruFocusChartData[] = [];
    let currentDate = new Date(startDate);

    // Generovanie demo dát
    while (currentDate <= endDate) {
      // Simulácia hodnôt s trendom a šumom
      const baseValue = this.getBaseValueForMetric(metric);
      const trend = Math.sin((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365) * Math.PI * 2) * 0.3;
      const noise = (Math.random() - 0.5) * 0.5;
      const value = baseValue * (1 + trend + noise);

      chartData.push({
        date: new Date(currentDate),
        value: Math.max(0.1, value),
        isExpensive: value > baseValue * 1.3,
        isCheap: value < baseValue * 0.7
      });

      // Posun na ďalší mesiac
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Výpočet percentilov z generovaných dát
    const values = chartData.map(d => d.value).sort((a, b) => a - b);
    const n = values.length;
    
    const calculatePercentile = (p: number) => {
      const index = Math.ceil((p / 100) * n) - 1;
      return values[Math.max(0, Math.min(index, n - 1))];
    };

    const percentile10 = calculatePercentile(10);
    const percentile90 = calculatePercentile(90);
    const median = calculatePercentile(50);

    // Pridanie percentilov ku všetkým bodom
    return chartData.map(point => ({
      ...point,
      median,
      percentile10,
      percentile90
    }));
  }

  /**
   * Získanie základnej hodnoty pre metriku
   */
  private static getBaseValueForMetric(metric: keyof GuruFocusMetrics): number {
    const baseValues: Record<keyof GuruFocusMetrics, number> = {
      peRatio: 20,
      psRatio: 5,
      pbRatio: 3,
      evEbitda: 12,
      fcfYield: 3,
      evRevenue: 6,
      evFcf: 15,
      priceTangibleBook: 4,
      pegRatio: 1.5,
      dividendYield: 2.5,
      roic: 12,
      roe: 15,
      debtToEquity: 0.8,
      currentRatio: 1.8,
      quickRatio: 1.2
    };

    return baseValues[metric] || 10;
  }

  /**
   * Aktualizácia GuruFocus metrík pre konkrétny dátum
   */
  static async updateGuruFocusMetrics(symbol: string, date: Date): Promise<void> {
    try {
      const metrics = await this.calculateGuruFocusMetrics(symbol, date);
      
      await prisma.dailyValuationHistory.upsert({
        where: { symbol_date: { symbol, date } },
        update: {
          ...(metrics.peRatio && { peRatio: metrics.peRatio }),
          ...(metrics.psRatio && { psRatio: metrics.psRatio }),
          ...(metrics.evEbitda && { evEbitda: metrics.evEbitda }),
          ...(metrics.fcfYield && { fcfYield: metrics.fcfYield }),
          updatedAt: new Date()
        },
        create: {
          symbol,
          date,
          closePrice: 100, // Placeholder
          ...(metrics.peRatio && { peRatio: metrics.peRatio }),
          ...(metrics.psRatio && { psRatio: metrics.psRatio }),
          ...(metrics.evEbitda && { evEbitda: metrics.evEbitda }),
          ...(metrics.fcfYield && { fcfYield: metrics.fcfYield })
        }
      });

      console.log(`✅ Updated GuruFocus metrics for ${symbol} on ${date.toISOString().split('T')[0]}`);
    } catch (error) {
      console.error(`❌ Failed to update GuruFocus metrics for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Hromadná aktualizácia pre všetky tickery
   */
  static async updateAllGuruFocusMetrics(date?: Date): Promise<void> {
    const targetDate = date || new Date();
    
    const tickers = await prisma.ticker.findMany({
      where: { lastPrice: { not: null } },
      select: { symbol: true }
    });

    console.log(`🔄 Updating GuruFocus metrics for ${tickers.length} tickers on ${targetDate.toISOString().split('T')[0]}`);

    for (const { symbol } of tickers) {
      try {
        await this.updateGuruFocusMetrics(symbol, targetDate);
      } catch (error) {
        console.error(`❌ Failed to update ${symbol}:`, error);
      }
    }

    console.log(`✅ GuruFocus metrics update completed`);
  }
}
