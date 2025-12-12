
/**
 * Konštanty pre veľkosti a thresholdy dlaždíc heatmapy
 */
export const TILE_SIZE_THRESHOLDS = {
    MIN_WIDTH: 30,
    MIN_HEIGHT: 20,
    MIN_AREA: 900, // Najmenšia plocha - bez textu
    SMALL_AREA: 2500, // Menšia plocha - len ticker (menší font)
    MEDIUM_AREA: 5000, // Malá plocha - len ticker (väčší font)
    LARGE_AREA: 10000, // Stredná plocha - ticker + % change
    MIN_INDUSTRY_WIDTH: 140,
    MIN_INDUSTRY_HEIGHT: 50,
} as const;

/**
 * Konštanty pre font sizing - úmerné škálovanie podľa plochy
 */
export const FONT_SIZE_CONFIG = {
    // Minimálna veľkosť písma pre čitateľnosť
    MIN_READABLE_SIZE: 8,
    MIN_SYMBOL_SIZE: 8,
    MIN_PERCENT_SIZE: 7,

    // Maximálna veľkosť písma
    MAX_SYMBOL_SIZE: 28,
    MAX_PERCENT_SIZE: 20,

    // Multiplikátory pre výpočet veľkosti písma z plochy
    // Použijeme logaritmickú škálu pre plynulejší prechod
    AREA_TO_FONT_BASE: 0.15, // Základný koeficient pre výpočet z plochy
    AREA_TO_FONT_LOG_BASE: 2.5, // Logaritmická báza pre plynulejší prechod
} as const;

/**
 * Konštanty pre layout a positioning
 */
export const LAYOUT_CONFIG = {
    SCALE_MARGIN: 0.85, // 15% okraj pri scale výpočte
    TOOLTIP_OFFSET: 15, // Offset tooltipu od kurzora
    SECTOR_GAP: 1, // Jednotná medzera medzi sektormi (v pixeloch) - čierna farba
    SECTOR_LABEL: {
        FONT_SIZE: 14,
        PADDING: '2px 6px',
        TOP: 2,
        LEFT: 6,
        LETTER_SPACING: '0.08em',
        BG_OPACITY: 0.85,
    },
    INDUSTRY_LABEL: {
        FONT_SIZE: 11,
        PADDING: '1px 4px',
        TOP: 4,
        LEFT: 6,
        LETTER_SPACING: '0.04em',
        BG_OPACITY: 0.65,
    },
} as const;
