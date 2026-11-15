import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/lib/utils/heatmapColors', () => ({
  getMetricNeutralPoint: () => 25,
}));

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    prefetch: jest.fn(),
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

jest.mock('next/dynamic', () => (loader: () => Promise<unknown>) => {
  const isMobileDyn = loader.toString().includes('MobileTreemapNew');
  const MockHeatmapDynamic = (props: { metric?: HeatmapMetric; sectorLabelVariant?: string }) =>
    React.createElement('div', {
      'data-testid': isMobileDyn ? 'mobile-heatmap' : 'desktop-heatmap',
      'data-metric': props.metric,
      'data-sector-variant': props.sectorLabelVariant,
    });
  return MockHeatmapDynamic;
});

jest.mock('@/hooks/useElementResize', () => ({
  useElementResize: () => ({
    ref: { current: null },
    size: { width: 1200, height: 640 },
  }),
}));

let mockIsMobile = false;
jest.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsMobile,
}));

const sampleData: CompanyNode[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    marketCap: 3500,
    changePercent: 0.13,
    marketCapDiff: 4.5,
    marketCapDiffAbs: 4.5,
    currentPrice: 230,
    peRatio: 39.2,
  },
];

jest.mock('@/hooks/useHeatmapData', () => ({
  useHeatmapData: () => ({
    data: sampleData,
    loading: false,
    error: null,
    lastUpdated: '2026-11-15T12:00:00.000Z',
    timeframe: 'day' as const,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/lib/ga', () => ({
  event: jest.fn(),
}));

import { useHeatmapMetric } from '@/hooks/useHeatmapMetric';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import MetricHeatmapClient, { getMetricNavigationTarget } from '@/app/heatmap/[slug]/MetricHeatmapClient';

describe('/heatmap/[slug] & explicit metric pinning', () => {
  beforeEach(() => {
    mockIsMobile = false;
    pushMock.mockReset();
    (window.localStorage.getItem as jest.Mock).mockReset();
    (window.localStorage.setItem as jest.Mock).mockReset();
  });

  test('useHeatmapMetric ignores localStorage when useStoredPreference is false and syncs initialMetric', async () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue('percent');

    let latestMetric: HeatmapMetric = 'percent';
    let latestSetMetric: (m: HeatmapMetric) => void = () => {};

    function Harness({
      initial,
      useStored,
      persist,
    }: {
      initial: HeatmapMetric;
      useStored: boolean;
      persist: boolean;
    }) {
      const { metric, setMetric } = useHeatmapMetric(initial, {
        useStoredPreference: useStored,
        persistPreference: persist,
      });
      latestMetric = metric;
      latestSetMetric = setMetric;
      return React.createElement('div', { 'data-metric': metric });
    }

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness, { initial: 'pe', useStored: false, persist: false }));
    });
    expect(latestMetric).toBe('pe');

    // Prop update (e.g. route change /heatmap/pe-ratio -> /heatmap/forward-pe) updates metric cleanly
    await act(async () => {
      root.render(React.createElement(Harness, { initial: 'fpe', useStored: false, persist: false }));
    });
    expect(latestMetric).toBe('fpe');

    // Manual update when persistPreference=false must not overwrite stored preference
    await act(async () => {
      latestSetMetric('ps');
    });
    expect(latestMetric).toBe('ps');
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
      'heatmap-metric-preference',
      expect.anything(),
    );

    act(() => root.unmount());
  });

  test('useHeatmapMetric restores and persists localStorage by default', async () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue('week');

    let latestMetric: HeatmapMetric = 'percent';
    let latestSetMetric: (m: HeatmapMetric) => void = () => {};

    function DefaultHarness() {
      const { metric, setMetric } = useHeatmapMetric('percent');
      latestMetric = metric;
      latestSetMetric = setMetric;
      return React.createElement('div', { 'data-metric': metric });
    }

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(DefaultHarness));
    });
    expect(latestMetric).toBe('week');

    await act(async () => {
      latestSetMetric('mcap');
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith('heatmap-metric-preference', 'mcap');

    act(() => root.unmount());
  });

  test('ResponsiveMarketHeatmap preserves initialMetric="pe" even when localStorage has "percent"', async () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue('percent');

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(ResponsiveMarketHeatmap, {
          initialMetric: 'pe',
          sectorLabelVariant: 'full',
        }),
      );
    });

    const canvas = container.querySelector('[data-testid="desktop-heatmap"]');
    expect(canvas?.getAttribute('data-metric')).toBe('pe');

    const select = container.querySelector('select[aria-label="Heatmap metric"]') as HTMLSelectElement | null;
    expect(select?.value).toBe('pe');

    act(() => root.unmount());
  });

  test('MetricHeatmapClient pins metric to URL slug, avoids floating canvas overlap, and routes metric changes', async () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue('percent');

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(MetricHeatmapClient, { metric: 'pe' }));
    });

    // Desktop heatmap receives 'pe' (not overridden by localStorage 'percent')
    const canvas = container.querySelector('[data-testid="desktop-heatmap"]');
    expect(canvas?.getAttribute('data-metric')).toBe('pe');

    // Only one metric selector renders (in the top toolbar, not overlaid over TECHNOLOGY on the canvas)
    const selects = container.querySelectorAll('select[aria-label="Heatmap metric"]');
    expect(selects).toHaveLength(1);
    const select = selects[0] as HTMLSelectElement;
    expect(select.value).toBe('pe');

    // Changing metric navigates cleanly via router.push
    await act(async () => {
      select.value = 'fpe';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(pushMock).toHaveBeenCalledWith('/heatmap/forward-pe');

    // Metrics without dedicated slug preserve selection via ?metric= query param
    expect(getMetricNavigationTarget('health')).toBe('/heatmap?metric=health');
    expect(getMetricNavigationTarget('pe')).toBe('/heatmap/pe-ratio');

    act(() => root.unmount());
  });

  test('MetricHeatmapClient preserves metric="pe" on mobile even when localStorage has "percent"', async () => {
    mockIsMobile = true;
    (window.localStorage.getItem as jest.Mock).mockReturnValue('percent');

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(MetricHeatmapClient, { metric: 'pe' }));
    });

    const mobileHeatmap = container.querySelector('[data-testid="mobile-heatmap"]');
    expect(mobileHeatmap?.getAttribute('data-metric')).toBe('pe');

    act(() => root.unmount());
  });
});
