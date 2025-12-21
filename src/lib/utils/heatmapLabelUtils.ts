
import { TILE_SIZE_THRESHOLDS, FONT_SIZE_CONFIG } from './heatmapConfig';

/**
 * Konfigurácia textu pre dlaždicu podľa jej veľkosti
 */
export type TileLabelConfig = {
    showSymbol: boolean;
    showPercent: boolean;
    symbolFontPx: number;
    percentFontPx?: number;
    align: 'center' | 'top-left';
};

/**
 * Obmedzí číslo na rozsah min-max
 */
export const clampNumber = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

/**
 * Vypočíta veľkosť písma na základe plochy dlaždice
 * Používa logaritmickú škálu pre plynulejší prechod medzi veľkosťami
 * @param area Plocha dlaždice v px²
 * @param minSize Minimálna veľkosť písma
 * @param maxSize Maximálna veľkosť písma
 * @returns Veľkosť písma v px
 */
export function calculateFontSizeFromArea(
    area: number,
    minSize: number,
    maxSize: number
): number {
    // Použijeme logaritmickú škálu pre plynulejší prechod
    const minArea = TILE_SIZE_THRESHOLDS.MIN_AREA;
    const maxArea = TILE_SIZE_THRESHOLDS.LARGE_AREA * 2; // Rozšírený max pre veľké dlaždice

    if (area <= minArea) {
        return minSize;
    }

    // Logaritmická škála
    const logArea = Math.log(area / minArea);
    const logMaxArea = Math.log(maxArea / minArea);
    const ratio = Math.min(logArea / logMaxArea, 1); // Obmedzíme na 0-1

    const fontSize = minSize + (maxSize - minSize) * ratio;
    return clampNumber(fontSize, minSize, maxSize);
}

/**
 * Vypočíta konfiguráciu textu pre dlaždicu podľa jej veľkosti
 * Písmo sa úmerne zmenšuje s plochou, ale zostáva čitateľné
 * @param widthPx Šírka dlaždice v pixeloch
 * @param heightPx Výška dlaždice v pixeloch
 * @returns Konfigurácia textu
 */
export function getTileLabelConfig(widthPx: number, heightPx: number): TileLabelConfig {
    const area = widthPx * heightPx;

    // 1) Najmenšia plocha – bez textu (iba farba)
    if (
        widthPx < TILE_SIZE_THRESHOLDS.MIN_WIDTH ||
        heightPx < TILE_SIZE_THRESHOLDS.MIN_HEIGHT ||
        area < TILE_SIZE_THRESHOLDS.MIN_AREA
    ) {
        return {
            showSymbol: false,
            showPercent: false,
            symbolFontPx: 0,
            align: 'center',
        };
    }

    // 2) Menšia plocha – len ticker (menší font, ale čitateľný)
    //    Plocha: MIN_AREA až SMALL_AREA
    if (area < TILE_SIZE_THRESHOLDS.SMALL_AREA) {
        // Agresívnejšie zmenšovanie pre menšie dlaždice
        // Použijeme lineárnu škálu namiesto logaritmickej pre presnejšie zmenšovanie
        const minArea = TILE_SIZE_THRESHOLDS.MIN_AREA;
        const maxArea = TILE_SIZE_THRESHOLDS.SMALL_AREA;
        const ratio = Math.min((area - minArea) / (maxArea - minArea), 1);
        // Allow a smaller minimum; final renderers may still hide if the text can't fit.
        const minFont = 7;
        const maxFont = 10;
        const symbolFontPx = minFont + (maxFont - minFont) * ratio;
        return {
            showSymbol: true,
            showPercent: false,
            symbolFontPx: Math.round(symbolFontPx),
            align: 'center',
        };
    }

    // 3) Malá plocha – len ticker (väčší font)
    //    Plocha: SMALL_AREA až MEDIUM_AREA
    if (area < TILE_SIZE_THRESHOLDS.MEDIUM_AREA) {
        // Agresívnejšie zmenšovanie pre stredné dlaždice
        const minArea = TILE_SIZE_THRESHOLDS.SMALL_AREA;
        const maxArea = TILE_SIZE_THRESHOLDS.MEDIUM_AREA;
        const ratio = Math.min((area - minArea) / (maxArea - minArea), 1);
        const minFont = 10;
        const maxFont = 14;
        const symbolFontPx = minFont + (maxFont - minFont) * ratio;
        return {
            showSymbol: true,
            showPercent: false,
            symbolFontPx: Math.round(symbolFontPx),
            align: 'center',
        };
    }

    // 4) Stredná plocha – ticker + % change
    //    Plocha: MEDIUM_AREA až LARGE_AREA
    if (area < TILE_SIZE_THRESHOLDS.LARGE_AREA) {
        const symbolFontPx = calculateFontSizeFromArea(
            area,
            FONT_SIZE_CONFIG.MIN_SYMBOL_SIZE + 5,
            FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE - 8
        );
        const percentFontPx = calculateFontSizeFromArea(
            area,
            FONT_SIZE_CONFIG.MIN_PERCENT_SIZE,
            FONT_SIZE_CONFIG.MAX_PERCENT_SIZE - 4
        );
        return {
            showSymbol: true,
            showPercent: true,
            symbolFontPx: Math.round(symbolFontPx),
            percentFontPx: Math.round(percentFontPx),
            align: 'center',
        };
    }

    // 5) Veľká plocha – ticker + % change (maximálna veľkosť)
    //    Plocha: LARGE_AREA+
    const symbolFontPx = calculateFontSizeFromArea(
        area,
        FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE - 6,
        FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE
    );
    const percentFontPx = calculateFontSizeFromArea(
        area,
        FONT_SIZE_CONFIG.MAX_PERCENT_SIZE - 4,
        FONT_SIZE_CONFIG.MAX_PERCENT_SIZE
    );

    return {
        showSymbol: true,
        showPercent: true,
        symbolFontPx: Math.round(symbolFontPx),
        percentFontPx: Math.round(percentFontPx),
        align: 'center',
    };
}
