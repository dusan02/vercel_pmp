import type { LucideIcon } from 'lucide-react';
import {
    ArrowDown, ArrowUpRight, BadgeCheck, Banknote, Check, Coins, Gem,
    HandCoins, Landmark, Percent, RefreshCcw, Scale, ShieldCheck, Sprout,
    Tag, TrendingDown, TrendingUp, Trophy, Vault, Zap,
} from 'lucide-react';

/**
 * Quick-screen pill icons — semantic color + shape for fast scanning
 * (gentle amber arrow = slow grower, steep green = fast grower, sprout =
 * value seed, shield = stalwart safety, red down-arrow = selloff, …).
 * Colors are semantic and kept on the icon even in the pill's active state.
 */
export const PRESET_ICONS: Record<string, { Icon: LucideIcon; cls: string }> = {
    Gem:          { Icon: Gem,          cls: 'text-violet-500' },
    Scale:        { Icon: Scale,        cls: 'text-sky-500' },
    Tag:          { Icon: Tag,          cls: 'text-emerald-500' },
    TrendingUp:   { Icon: TrendingUp,   cls: 'text-green-500' },
    Check:        { Icon: Check,        cls: 'text-emerald-600 dark:text-emerald-400' },
    BadgeCheck:   { Icon: BadgeCheck,   cls: 'text-emerald-500' },
    Vault:        { Icon: Vault,        cls: 'text-blue-500' },
    Banknote:     { Icon: Banknote,     cls: 'text-emerald-500' },
    Trophy:       { Icon: Trophy,       cls: 'text-amber-500' },
    Sprout:       { Icon: Sprout,       cls: 'text-green-600 dark:text-green-400' },
    Coins:        { Icon: Coins,        cls: 'text-amber-500' },
    Percent:      { Icon: Percent,      cls: 'text-violet-500' },
    Landmark:     { Icon: Landmark,     cls: 'text-slate-500 dark:text-slate-400' },
    RefreshCcw:   { Icon: RefreshCcw,   cls: 'text-orange-500' },
    ShieldCheck:  { Icon: ShieldCheck,  cls: 'text-blue-500' },
    ArrowUpRight: { Icon: ArrowUpRight, cls: 'text-amber-500' },
    TrendingDown: { Icon: TrendingDown, cls: 'text-rose-500' },
    HandCoins:    { Icon: HandCoins,    cls: 'text-emerald-500' },
    ArrowDown:    { Icon: ArrowDown,    cls: 'text-red-500' },
    Zap:          { Icon: Zap,          cls: 'text-green-500' },
};

/** Render-size helper: preset icons sit inside 11px-text pills/chips. */
export function renderPresetIcon(icon: string | string[] | undefined, size = 11) {
    if (!icon) return null;
    const names = Array.isArray(icon) ? icon : [icon];
    return names.map((n) => {
        const d = PRESET_ICONS[n];
        if (!d) return null;
        const { Icon, cls } = d;
        return <Icon key={n} size={size} strokeWidth={2.5} className={cls} />;
    });
}
