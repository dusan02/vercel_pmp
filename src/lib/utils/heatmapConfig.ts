
/**
 * Konštanty pre veľkosti a thresholdy dlaždíc heatmapy
 */
export const TILE_SIZE_THRESHOLDS = {
    // These thresholds control when we attempt to render text labels inside tiles.
    // Keep them permissive; final readability is enforced by per-tile font fitting in renderers.
    MIN_WIDTH: 16,
    MIN_HEIGHT: 10,
    MIN_AREA: 160, // allow ticker on smaller tiles (final fit logic may still hide)
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
    MIN_READABLE_SIZE: 7,
    MIN_SYMBOL_SIZE: 7,
    MIN_PERCENT_SIZE: 7,

    // Maximálna veľkosť písma
    MAX_SYMBOL_SIZE: 64,
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
    // Legacy - kept for backward compatibility, use SECTOR_LABEL_COMPACT or SECTOR_LABEL_FULL
    SECTOR_LABEL: {
        FONT_SIZE: 8.4,
        PADDING: '2px 6px',
        TOP: 2,
        LEFT: 6,
        LETTER_SPACING: '0.08em',
        BG_OPACITY: 0.85,
        HEIGHT: 18,
    },
    // Compact variant for homepage - subtle, glass effect
    SECTOR_LABEL_COMPACT: {
        FONT_SIZE_MIN: 9,
        FONT_SIZE_MAX: 10,
        PADDING: '1px 6px',
        LEFT: 6,
        LETTER_SPACING: '0.04em',
        BG_OPACITY: 0.45,
        BG_OPACITY_HOVER: 0.55,
        HEIGHT: 16,
        BORDER_RADIUS: 999, // Pill shape
        BORDER: '1px solid rgba(255, 255, 255, 0.10)',
        BACKDROP_BLUR: '6px',
        FONT_WEIGHT: 600, // Semibold
    },
    // Full variant for heatmap page - prominent, section header style
    SECTOR_LABEL_FULL: {
        FONT_SIZE_MIN: 12,
        FONT_SIZE_MAX: 14,
        PADDING: '3px 10px',
        LEFT: 8,
        LETTER_SPACING: '0.06em',
        BG_OPACITY: 0.60,
        BG_OPACITY_HOVER: 0.70,
        HEIGHT: 24,
        BORDER_RADIUS: 8,
        BORDER: '1px solid rgba(255, 255, 255, 0.15)',
        BACKDROP_BLUR: '8px',
        FONT_WEIGHT: 700, // Bold
        SHOW_SUMMARY: true, // Show sector avg % or mcap delta
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
