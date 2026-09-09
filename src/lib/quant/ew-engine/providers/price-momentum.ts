/**
 * Price Momentum Feature Provider
 * ==================================
 *
 * Computes Momentum category features from PitPriceFact.
 *
 * Features:
 *   Momentum (25%):
 *     - priceStrengthPct: relative return vs SPY over trailing 6 months
 *     - trendAlignment: binary indicator (100 if above 50-day MA, 0 if below)
 *     - relativeVolume: current volume vs trailing 20-day average
 *
 * PIT: All prices queried with availableAt <= asOfTime. orderBy for determinism.
 */

import { PrismaClient } from '../../p4-engine/db/client';
import {
  EwFeature,
  FeatureProvider,
  FeatureCategory,
  makeMissingFeature,
} from '../types.js';

const PROVIDER_VERSION = 'PRICE-MOM-v1';
const SPY_TICKER = 'SPY';
const LOOKBACK_DAYS = 126; // ~6 months
const MA_WINDOW = 50;
const VOLUME_WINDOW = 20;

interface PriceBar {
  tradeDate: Date;
  availableAt: Date;
  adjustedClose: number | null;
  close: number | null;
  volume: bigint | null;
}

export class PriceMomentumProvider implements FeatureProvider {
  readonly categories: readonly FeatureCategory[] = Object.freeze(['MOMENTUM']);
  readonly version = PROVIDER_VERSION;

  constructor(private prisma: PrismaClient) {}

  isAvailable(): boolean {
    return true;
  }

  describeStatus(): string {
    return `${PROVIDER_VERSION}: PitPriceFact (available)`;
  }

  async computeFeatures(securityId: string, asOfTime: string): Promise<EwFeature[]> {
    const asOf = new Date(asOfTime);

    // Load stock prices (PIT: availableAt <= asOfTime)
    const stockPrices = await this.prisma.pitPriceFact.findMany({
      where: {
        securityId,
        availableAt: { lte: asOf },
        tradeDate: { lte: asOf },
      },
      select: { tradeDate: true, availableAt: true, adjustedClose: true, close: true, volume: true },
      orderBy: { tradeDate: 'desc' },
      take: LOOKBACK_DAYS + MA_WINDOW + 10, // enough for all calculations
    });

    // Load SPY prices
    const spyPrices = await this.prisma.pitPriceFact.findMany({
      where: {
        sourceTicker: SPY_TICKER,
        availableAt: { lte: asOf },
        tradeDate: { lte: asOf },
      },
      select: { tradeDate: true, adjustedClose: true },
      orderBy: { tradeDate: 'desc' },
      take: LOOKBACK_DAYS + 10,
    });

    if (stockPrices.length < 2 || spyPrices.length < 2) {
      return [
        makeMissingFeature('priceStrengthPct', 'MOMENTUM', asOfTime, 'Insufficient price history'),
        makeMissingFeature('trendAlignment', 'MOMENTUM', asOfTime, 'Insufficient price history'),
        makeMissingFeature('relativeVolume', 'MOMENTUM', asOfTime, 'Insufficient price history'),
      ];
    }

    // Sort ascending for calculations
    const stockAsc = stockPrices.reverse();
    const spyAsc = spyPrices.reverse();

    const features: EwFeature[] = [];
    const latest = stockAsc[stockAsc.length - 1]!;

    // ─── priceStrengthPct ───
    features.push(this.computePriceStrength(stockAsc, spyAsc, asOfTime, latest));

    // ─── trendAlignment ───
    features.push(this.computeTrendAlignment(stockAsc, asOfTime, latest));

    // ─── relativeVolume ───
    features.push(this.computeRelativeVolume(stockAsc, asOfTime, latest));

    return features;
  }

  private computePriceStrength(
    stockAsc: PriceBar[],
    spyAsc: { tradeDate: Date; adjustedClose: number | null }[],
    asOfTime: string,
    latest: PriceBar
  ): EwFeature {
    const stockT1 = stockAsc[stockAsc.length - 1]!;
    const stockT0 = stockAsc[Math.max(0, stockAsc.length - LOOKBACK_DAYS)]!;
    const spyT1 = spyAsc[spyAsc.length - 1]!;
    const spyT0 = spyAsc[Math.max(0, spyAsc.length - LOOKBACK_DAYS)]!;

    if (!stockT1.adjustedClose || !stockT0.adjustedClose || !spyT1.adjustedClose || !spyT0.adjustedClose) {
      return makeMissingFeature('priceStrengthPct', 'MOMENTUM', asOfTime, 'Missing adjusted close');
    }
    if (stockT0.adjustedClose === 0 || spyT0.adjustedClose === 0) {
      return makeMissingFeature('priceStrengthPct', 'MOMENTUM', asOfTime, 'Zero reference price', 'INVALID');
    }

    const stockReturn = ((stockT1.adjustedClose - stockT0.adjustedClose) / stockT0.adjustedClose) * 100;
    const spyReturn = ((spyT1.adjustedClose - spyT0.adjustedClose) / spyT0.adjustedClose) * 100;
    const relativeStrength = stockReturn - spyReturn;

    return Object.freeze({
      key: 'priceStrengthPct',
      category: 'MOMENTUM',
      value: relativeStrength,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'POLYGON',
      accession: null,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: 'stockReturn(6M) - spyReturn(6M)',
        inputs: Object.freeze({ stockReturn, spyReturn, stockT1: stockT1.adjustedClose, stockT0: stockT0.adjustedClose }),
        periodEnd: stockT1.tradeDate.toISOString(),
        periodStart: stockT0.tradeDate.toISOString(),
        notes: '6-month relative strength vs SPY',
      }),
    });
  }

  private computeTrendAlignment(
    stockAsc: PriceBar[],
    asOfTime: string,
    latest: PriceBar
  ): EwFeature {
    if (stockAsc.length < MA_WINDOW + 1) {
      return makeMissingFeature('trendAlignment', 'MOMENTUM', asOfTime, `Need ${MA_WINDOW + 1} bars for MA`);
    }

    // Compute 50-day MA
    const relevantBars = stockAsc.slice(-(MA_WINDOW + 1));
    const maBars = relevantBars.slice(0, MA_WINDOW);
    const validMaBars = maBars.filter(b => b.adjustedClose !== null);
    if (validMaBars.length < MA_WINDOW) {
      return makeMissingFeature('trendAlignment', 'MOMENTUM', asOfTime, 'Insufficient valid bars for MA');
    }

    const ma = validMaBars.reduce((s, b) => s + (b.adjustedClose as number), 0) / MA_WINDOW;
    const currentPrice = relevantBars[relevantBars.length - 1]!.adjustedClose;

    if (currentPrice === null) {
      return makeMissingFeature('trendAlignment', 'MOMENTUM', asOfTime, 'Current price is null');
    }

    // trendAlignment = 100 if above MA, 0 if below
    const alignment = currentPrice > ma ? 100 : 0;

    return Object.freeze({
      key: 'trendAlignment',
      category: 'MOMENTUM',
      value: alignment,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'POLYGON',
      accession: null,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: 'currentPrice > MA50 ? 100 : 0',
        inputs: Object.freeze({ currentPrice, ma50: ma }),
        periodEnd: latest.tradeDate.toISOString(),
        periodStart: relevantBars[0]!.tradeDate.toISOString(),
        notes: 'Binary trend indicator vs 50-day MA',
      }),
    });
  }

  private computeRelativeVolume(
    stockAsc: PriceBar[],
    asOfTime: string,
    latest: PriceBar
  ): EwFeature {
    if (stockAsc.length < VOLUME_WINDOW + 1) {
      return makeMissingFeature('relativeVolume', 'MOMENTUM', asOfTime, `Need ${VOLUME_WINDOW + 1} bars for volume MA`);
    }

    const volBars = stockAsc.slice(-(VOLUME_WINDOW + 1));
    const ZERO_VOL = BigInt(0);
    const trailingVol = volBars.slice(0, VOLUME_WINDOW).filter(b => b.volume !== null && b.volume > ZERO_VOL);
    if (trailingVol.length < VOLUME_WINDOW) {
      return makeMissingFeature('relativeVolume', 'MOMENTUM', asOfTime, 'Insufficient volume data');
    }

    const avgVolume = trailingVol.reduce((s, b) => s + Number(b.volume), 0) / VOLUME_WINDOW;
    const currentVolume = volBars[volBars.length - 1]!.volume;

    if (currentVolume === null || currentVolume === ZERO_VOL || avgVolume === 0) {
      return makeMissingFeature('relativeVolume', 'MOMENTUM', asOfTime, 'Invalid volume', 'INVALID');
    }

    const relVol = Number(currentVolume) / avgVolume;

    return Object.freeze({
      key: 'relativeVolume',
      category: 'MOMENTUM',
      value: relVol,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'POLYGON',
      accession: null,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: 'currentVolume / avgVolume(20d)',
        inputs: Object.freeze({ currentVolume: Number(currentVolume), avgVolume20: avgVolume }),
        periodEnd: latest.tradeDate.toISOString(),
        periodStart: trailingVol[0]!.tradeDate.toISOString(),
        notes: 'Volume relative to 20-day average',
      }),
    });
  }
}
