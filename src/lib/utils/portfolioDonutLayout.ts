export interface DonutLabelInput {
  key: string;
  label: string;
  percentage: number;
  /** Midpoint angle in radians clockwise from 12 o'clock (0 .. 2*PI). */
  midAngleRad: number;
}

export interface DonutLabelLayout {
  key: string;
  label: string;
  percentage: number;
  isRight: boolean;
  startX: number;
  startY: number;
  elbowX: number;
  elbowY: number;
  endX: number;
  textX: number;
  labelY: number;
}

export const PORTFOLIO_DONUT_GEOMETRY = {
  size: 240,
  paddingX: 150,
  paddingY: 58,
  get viewBoxWidth() {
    return this.size + this.paddingX * 2; // 540
  },
  get viewBoxHeight() {
    return this.size + this.paddingY * 2; // 356
  },
} as const;

export interface DonutViewBox {
  viewBoxWidth: number;
  viewBoxHeight: number;
  centerX: number;
  centerY: number;
  aspectRatio: string;
}

/** Computes shared responsive SVG viewBox geometry for portfolio donut charts. */
export function getDonutViewBox(size: number = PORTFOLIO_DONUT_GEOMETRY.size): DonutViewBox {
  const viewBoxWidth = size + PORTFOLIO_DONUT_GEOMETRY.paddingX * 2;
  const viewBoxHeight = size + PORTFOLIO_DONUT_GEOMETRY.paddingY * 2;
  return {
    viewBoxWidth,
    viewBoxHeight,
    centerX: viewBoxWidth / 2,
    centerY: viewBoxHeight / 2,
    aspectRatio: `${viewBoxWidth} / ${viewBoxHeight}`,
  };
}

function polarToCartesian(angleRad: number, radius: number): { x: number; y: number } {
  const a = angleRad - Math.PI / 2;
  return {
    x: radius * Math.cos(a),
    y: radius * Math.sin(a),
  };
}

function buildArcPath(startRad: number, endRad: number, rInner: number, rOuter: number): string {
  const startOuter = polarToCartesian(endRad, rOuter);
  const endOuter = polarToCartesian(startRad, rOuter);
  const startInner = polarToCartesian(endRad, rInner);
  const endInner = polarToCartesian(startRad, rInner);
  const largeArc = endRad - startRad <= Math.PI ? 0 : 1;

  return [
    'M', startOuter.x, startOuter.y,
    'A', rOuter, rOuter, 0, largeArc, 0, endOuter.x, endOuter.y,
    'L', endInner.x, endInner.y,
    'A', rInner, rInner, 0, largeArc, 1, startInner.x, startInner.y,
    'Z',
  ].join(' ');
}

/**
 * Generates SVG arc path(s) in radians clockwise from 12 o'clock.
 * Splits full-circle (~2π) spans into two π-radian paths to avoid SVG start==end degeneration.
 */
export function createDonutArcPaths(
  startRad: number,
  endRad: number,
  rInner: number,
  rOuter: number,
): string[] {
  const span = endRad - startRad;
  if (span <= 0) return [];
  if (span >= Math.PI * 2 - 1e-6) {
    return [
      buildArcPath(startRad, startRad + Math.PI, rInner, rOuter),
      buildArcPath(startRad + Math.PI, endRad, rInner, rOuter),
    ];
  }
  return [buildArcPath(startRad, endRad, rInner, rOuter)];
}

/** Lightens (positive percent) or darkens (negative percent) a hex RGB color. */
export function adjustHexColor(hex: string, percent: number): string {
  if (!hex) return '#000000';
  let normalized = hex.replace(/^\s*#|\s*$/g, '');
  if (normalized.length === 3) {
    normalized = normalized.replace(/(.)/g, '$1$1');
  }
  const rRaw = parseInt(normalized.slice(0, 2), 16);
  const gRaw = parseInt(normalized.slice(2, 4), 16);
  const bRaw = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(rRaw) || Number.isNaN(gRaw) || Number.isNaN(bRaw)) return hex;

  const amt = Math.floor(2.55 * percent);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(rRaw + amt)}${toHex(gRaw + amt)}${toHex(bRaw + amt)}`;
}

const INDUSTRY_ABBREVIATIONS: Record<string, string> = {
  'Semiconductor Equipment & Materials': 'Semi Equipment',
  'Internet Content & Information': 'Internet Content',
  'Software - Application': 'Software (App)',
  'Software—Application': 'Software (App)',
  'Software - Infrastructure': 'Software (Infra)',
  'Software—Infrastructure': 'Software (Infra)',
  'Footwear & Accessories': 'Footwear & Acc.',
  'Consumer Electronics': 'Cons. Electronics',
  'Information Technology Services': 'IT Services',
  'Communication Equipment': 'Comm. Equipment',
  'Specialty Industrial Machinery': 'Ind. Machinery',
  'Financial Data & Stock Exchanges': 'Fin. Data & Exch.',
  'Asset Management': 'Asset Mgmt.',
  'Aerospace & Defense': 'Aerospace & Def.',
  'Diagnostics & Research': 'Diagnostics',
  'Medical Instruments & Supplies': 'Med. Instruments',
};

/** Shortens long Finnhub/Yahoo industry names so SVG leader labels never clip. */
export function shortenIndustryLabel(name: string | null | undefined, maxLen: number = 17): string {
  if (!name) return 'Unknown';
  const mapped = INDUSTRY_ABBREVIATIONS[name];
  if (mapped) return mapped;
  // Normalize em-dash industry suffixes like "Software—Application"
  const normalized = name.replace(/\s*[—–-]\s*/g, ' ');
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trimEnd()}…`;
}

/** Deterministic compact total formatting (always uses '.' decimal separator). */
export function formatDonutTotal(num: number): string {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}k`;
  return `$${num.toFixed(0)}`;
}

/**
 * Computes non-overlapping left/right radial leader-line labels for a donut chart.
 * Separates labels by hemisphere and vertically relaxes collisions while keeping
 * horizontal clearance outside the outer donut circle.
 */
export function layoutDonutLabels(
  items: DonutLabelInput[],
  outerRadius: number,
  halfHeight: number,
  options: { labelOffset?: number; tailLength?: number; minGapY?: number } = {},
): DonutLabelLayout[] {
  const labelOffset = options.labelOffset ?? 12;
  const tailLength = options.tailLength ?? 12;
  const minGapY = options.minGapY ?? 28;
  const labelRadius = outerRadius + labelOffset;
  const safeClearanceR = outerRadius + 10;

  const minY = -halfHeight + 16;
  const maxY = halfHeight - 22;

  const seed = items.map((item) => {
    const theta = item.midAngleRad - Math.PI / 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const isRight = item.midAngleRad < Math.PI;
    return {
      ...item,
      isRight,
      startX: outerRadius * cos,
      startY: outerRadius * sin,
      anchorX: labelRadius * cos,
      anchorY: labelRadius * sin,
      labelY: labelRadius * sin,
    };
  });

  const relaxSide = (side: typeof seed) => {
    if (side.length === 0) return;
    side.sort((a, b) => a.anchorY - b.anchorY);
    side[0]!.labelY = Math.max(minY, Math.min(maxY, side[0]!.labelY));
    for (let i = 1; i < side.length; i++) {
      side[i]!.labelY = Math.max(side[i]!.labelY, side[i - 1]!.labelY + minGapY);
    }
    if (side[side.length - 1]!.labelY > maxY) {
      side[side.length - 1]!.labelY = maxY;
      for (let i = side.length - 2; i >= 0; i--) {
        side[i]!.labelY = Math.min(side[i]!.labelY, side[i + 1]!.labelY - minGapY);
      }
      side[0]!.labelY = Math.max(minY, side[0]!.labelY);
    }
  };

  const right = seed.filter((d) => d.isRight);
  const left = seed.filter((d) => !d.isRight);
  relaxSide(right);
  relaxSide(left);

  return [...right, ...left].map((d) => {
    const sign = d.isRight ? 1 : -1;
    // Keep the elbow horizontally clear of the outer donut circumference when nudged vertically.
    const circleClearX =
      Math.abs(d.labelY) < safeClearanceR
        ? Math.sqrt(Math.max(0, safeClearanceR * safeClearanceR - d.labelY * d.labelY))
        : 0;
    const elbowX = sign * Math.max(Math.abs(d.anchorX), circleClearX);
    const elbowY = d.labelY;
    const endX = elbowX + tailLength * sign;
    const textX = endX + 4 * sign;

    return {
      key: d.key,
      label: d.label,
      percentage: d.percentage,
      isRight: d.isRight,
      startX: d.startX,
      startY: d.startY,
      elbowX,
      elbowY,
      endX,
      textX,
      labelY: d.labelY,
    };
  });
}
