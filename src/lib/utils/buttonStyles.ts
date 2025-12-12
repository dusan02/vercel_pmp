/**
 * Unified button styles for consistent UI across the application
 */

/**
 * Base button styles - common for all buttons
 */
export const BUTTON_BASE = 'transition-colors duration-200 font-semibold rounded-lg';

/**
 * Primary button (main action button)
 * Redesigned to be lighter and more modern (Ghost/Soft style)
 * Example: "View Full Heatmap →"
 * 
 * Update: Ensuring high readability on blue backgrounds.
 * If the button is on a white background, blue text/light blue bg is fine.
 * However, the user complains about readability when "blue background".
 * This suggests the button might be sitting on a blue container OR the user wants a solid blue button with white text for better visibility.
 * 
 * Let's revert to a Solid Blue button for Primary actions to ensure it pops and is readable everywhere.
 * Text: White, Bg: Blue-600, Hover: Blue-700.
 */
export const BUTTON_PRIMARY = 'inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-200 shadow-sm dark:bg-blue-600 dark:hover:bg-blue-500';

/**
 * Secondary button (cancel, close, alternative actions)
 * White background with border, gray text.
 */
export const BUTTON_SECONDARY = 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors';

/**
 * Icon button (generic)
 * Transparent background, gray text, light hover.
 */
export const BUTTON_ICON = 'p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';

/**
 * Danger Icon button (delete, remove)
 * Transparent background, gray text, red hover.
 */
export const BUTTON_ICON_DANGER = 'p-2 rounded-full text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors';

/**
 * Toggle button container (legacy)
 */
export const BUTTON_TOGGLE_CONTAINER = 'flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1';

/**
 * Toggle button - active state (legacy)
 */
export const BUTTON_TOGGLE_ACTIVE = `${BUTTON_BASE} bg-blue-600 !text-white text-xs px-3 py-1.5`;

/**
 * Toggle button - inactive state (legacy)
 */
export const BUTTON_TOGGLE_INACTIVE = `${BUTTON_BASE} text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 text-xs px-3 py-1.5`;

/**
 * Helper function to get toggle button classes
 */
export function getToggleButtonClasses(isActive: boolean): string {
  return isActive ? BUTTON_TOGGLE_ACTIVE : BUTTON_TOGGLE_INACTIVE;
}

/**
 * Segmented Control Styles (Modern Toggle)
 * Improved contrast and readability
 * 
 * User Request:
 * - "pozadie buttonov bude vždy biele" (Background always white)
 * - "ak button aktívny je font modrý, ak neaktivný tak šedý font" (Active = Blue font, Inactive = Gray font)
 */
export const SEGMENTED_CONTROL_CONTAINER = 'inline-flex bg-white dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700';
export const SEGMENTED_CONTROL_BUTTON_BASE = 'text-sm font-medium px-4 py-1.5 rounded-md transition-all duration-200 focus:outline-none select-none';

// Active: White background (transparent on white container, or explicit white), Blue Text, Font Bold
export const SEGMENTED_CONTROL_ACTIVE = `${SEGMENTED_CONTROL_BUTTON_BASE} bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold shadow-sm ring-1 ring-slate-200 dark:ring-slate-600`;

// Inactive: White background (transparent), Gray Text, Gray Hover Background
export const SEGMENTED_CONTROL_INACTIVE = `${SEGMENTED_CONTROL_BUTTON_BASE} bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700`;

export function getSegmentedButtonClasses(isActive: boolean): string {
  return isActive ? SEGMENTED_CONTROL_ACTIVE : SEGMENTED_CONTROL_INACTIVE;
}

/**
 * Heatmap Specific Toggle Styles
 * Reuse the same logic: White BG always, Blue Active Text, Gray Inactive Text.
 */
export const HEATMAP_TOGGLE_CONTAINER = 'inline-flex bg-white dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700 gap-1';
export const HEATMAP_TOGGLE_BUTTON_BASE = 'text-sm font-medium px-4 py-1.5 rounded-md transition-all duration-200 focus:outline-none select-none';

// Active: Blue BG (Solid), White Text, Shadow
export const HEATMAP_TOGGLE_ACTIVE = `${HEATMAP_TOGGLE_BUTTON_BASE} bg-blue-600 dark:bg-blue-600 text-white font-bold shadow-sm`;

// Inactive: White/Dark BG, Gray Text, Light Gray Hover Background
export const HEATMAP_TOGGLE_INACTIVE = `${HEATMAP_TOGGLE_BUTTON_BASE} bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700`;

export function getHeatmapToggleButtonClasses(isActive: boolean): string {
  return isActive ? HEATMAP_TOGGLE_ACTIVE : HEATMAP_TOGGLE_INACTIVE;
}

/**
 * Primary button size variants
 * (Updated to use the new base style, sizes handled by padding utility classes if needed override)
 */
export const BUTTON_PRIMARY_SM = `${BUTTON_PRIMARY}`; // Base is already small/medium
export const BUTTON_PRIMARY_MD = `${BUTTON_PRIMARY} px-5 py-2.5 text-base`;
export const BUTTON_PRIMARY_LG = `${BUTTON_PRIMARY} px-6 py-3 text-lg`;
