# Analýza UX Layout - Mobile vs Desktop

## 📱 MOBILNÁ VERZIA (max-width: 1023px)

### Štruktúra HTML

```
MobileApp (div.mobile-app)
├── MobileHeader (header.mobile-app-header) - FIXED, top: 0
│   └── mobile-app-header-content
│       ├── mobile-app-brand (Logo + "PreMarketPrice")
│       └── LoginButton
├── mobile-app-content (div.mobile-app-content)
│   └── MobileScreen (div.mobile-app-screen) - ABSOLUTE positioned
│       ├── screen-heatmap
│       ├── screen-portfolio
│       ├── screen-favorites
│       ├── screen-earnings
│       └── screen-all-stocks
└── MobileTabBar (nav.mobile-app-tabbar) - FIXED, bottom: 0
```

### CSS Kľúčové vlastnosti

#### `.mobile-app` (hlavný wrapper)
- `display: flex`
- `flex-direction: column`
- `height: 100dvh` (fallback: `100vh`)
- `background: #0f0f0f` (dark na mobile)
- `overflow: hidden`
- **Žiadne borders/outlines** (prevent white lines)

#### `.mobile-app-header` (fixed header)
- `position: fixed`
- `top: 0`
- `left: 0`
- `right: 0`
- `z-index: 100`
- `background: #0f0f0f` (solid, no blur na mobile)
- `border-bottom: 1px solid rgba(255, 255, 255, 0.08)`
- **Žiadne vertikálne borders** (border-left/right: none)
- `width: 100%`
- `height: var(--header-h)` (56px)

#### `.mobile-app-content` (content area)
- `flex: 1`
- `padding-top: var(--header-h)` (56px - kompenzácia pre fixed header)
- `padding-top: 0` pre `.is-heatmap` (heatmap má vlastný header)
- `overflow: hidden`
- `position: relative`
- **Žiadne borders/outlines** na mobile

#### `.mobile-app-screen` (individual screens)
- `position: absolute`
- `top: 0`, `left: 0`, `right: 0`, `bottom: 0`
- `width: 100%`, `height: 100%`
- `overflow-y: auto`
- `padding: 1rem` (default)
- **Padding-top pre screens** (okrem heatmap):
  - `padding-top: calc(var(--header-h) + 0.5rem) !important`
  - Prevents headings stuck under header

#### `.mobile-app-tabbar` (bottom navigation)
- `position: fixed`
- `bottom: 0`
- `left: 0`
- `right: 0`
- `z-index: 9999`
- `background: #0f0f0f` (solid, no blur na mobile)
- `border-top: 1px solid rgba(255, 255, 255, 0.08)`
- **Žiadne vertikálne borders**
- `width: 100%`
- `height: var(--tabbar-h)` (72px)
- `padding-bottom: calc(0.5rem + env(safe-area-inset-bottom))`

### Kontajnery na mobile

1. **`.mobile-app`** - hlavný wrapper (full viewport)
2. **`.mobile-app-content`** - content area (flex: 1)
3. **`.mobile-app-screen`** - individual screens (absolute positioned)
4. **`.container`** - base container (max-width: 100%, padding: 1rem)

### Čiary/Borders na mobile

**Odstránené všetky vertikálne čiary:**
- `border-left: none !important`
- `border-right: none !important`
- `outline: none !important`
- `box-shadow: none !important`

**Zachované len horizontálne separátory:**
- Header: `border-bottom: 1px solid rgba(255, 255, 255, 0.08)`
- Tabbar: `border-top: 1px solid rgba(255, 255, 255, 0.08)`

---

## 💻 DESKTOP VERZIA (min-width: 1024px)

### Štruktúra HTML

```
homepage-container (div.homepage-container)
├── header-wrapper (div.header-wrapper)
│   └── container (div.container)
│       └── PageHeader
│           └── SectionNavigation (hidden lg:block)
├── main.container (main.container)
│   └── desktop-layout-wrapper (div.desktop-layout-wrapper)
│       ├── section-heatmap (div#section-heatmap)
│       ├── section-portfolio (div#section-portfolio)
│       ├── section-favorites (div#section-favorites)
│       ├── section-earnings (div#section-earnings)
│       └── section-all-stocks (div#section-all-stocks)
└── footer (footer.footer) - hidden lg:block
```

### CSS Kľúčové vlastnosti

#### `.homepage-container`
- Base container pre desktop layout
- Scroll-based (nie tab-based ako mobile)

#### `.header-wrapper`
- `background: rgba(255, 255, 255, 0.9)`
- `backdrop-filter: blur(8px)`
- `position: sticky`
- `top: 0`
- `z-index: 50`
- `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05)`
- `border-bottom: 1px solid var(--clr-border)`

#### `.header-container`
- `max-width: 1280px`
- `margin: 0 auto`
- `padding: 0 1.5rem`
- Flex layout: `header-left` | `header-center` | `header-right`

#### `.container` (base container)
- `width: 100%`
- `max-width: 100%` (na mobile)
- `margin: 0 auto`
- `padding: 0 1rem` (mobile: 0.75rem, small: 0.5rem)

#### `.desktop-layout-wrapper`
- Scroll-based layout
- Sections majú `scroll-mt-20` (scroll margin top)
- Každá sekcia má `id="section-{name}"`

#### `.footer`
- `hidden lg:block` (len na desktop)
- `background: var(--clr-surface)`
- `border-top: 1px solid var(--clr-border)`
- `padding: 2rem 0`

### Kontajnery na desktop

1. **`.homepage-container`** - hlavný wrapper
2. **`.header-wrapper`** - sticky header
3. **`.container`** - base container (max-width: 1280px na desktop)
4. **`.desktop-layout-wrapper`** - scroll-based content
5. **`#section-{name}`** - individual sections

### Čiary/Borders na desktop

**Zachované borders:**
- Header: `border-bottom: 1px solid var(--clr-border)`
- Footer: `border-top: 1px solid var(--clr-border)`
- Sections: `border: 1px solid var(--clr-border-section)`
- Cards/Tables: `border: 1px solid var(--clr-border)`

---

## 🔄 ROZDIELY MOBILE vs DESKTOP

### 1. Layout prístup
- **Mobile**: Tab-based (swipe medzi screens, fixed header/tabbar)
- **Desktop**: Scroll-based (všetko na jednej stránke, sticky header)

### 2. Header
- **Mobile**: Fixed, dark background (#0f0f0f), no blur
- **Desktop**: Sticky, light background, blur effect

### 3. Navigation
- **Mobile**: Bottom tab bar (fixed)
- **Desktop**: Top navigation (sticky, v headeri)

### 4. Content area
- **Mobile**: Absolute positioned screens (swipe)
- **Desktop**: Scroll-based sections

### 5. Background
- **Mobile**: Dark (#0f0f0f)
- **Desktop**: Light (white/gray)

### 6. Borders
- **Mobile**: Žiadne vertikálne borders (prevent white lines)
- **Desktop**: Normálne borders pre separáciu

---

## 🎯 KONTROLA ČIAR/BORDERS

### Potenciálne problémy (white lines)

1. **Header/Tabbar na mobile:**
   - ✅ Odstránené `border-left/right`
   - ✅ Odstránené `outline`
   - ✅ Odstránené `box-shadow`
   - ✅ Solid background namiesto blur

2. **Content area na mobile:**
   - ✅ Odstránené `border-left/right`
   - ✅ `overflow-x: hidden`
   - ✅ `width: 100%`, `max-width: 100%`

3. **Root elements:**
   - ✅ `html`, `body`, `#__next`, `.mobile-app` - všetko `width: 100%`, `max-width: 100%`
   - ✅ `overflow-x: hidden`
   - ✅ Unified background (#0f0f0f)

### Zachované čiary (len horizontálne)

- Header `border-bottom` (separátor)
- Tabbar `border-top` (separátor)
- Section borders na desktop (normálne)

---

## 📝 ZÁVER

**Mobile layout:**
- Tab-based navigation
- Fixed header + tabbar
- Absolute positioned screens
- Dark theme
- **Žiadne vertikálne borders** (prevent white lines)

**Desktop layout:**
- Scroll-based navigation
- Sticky header
- Normal flow sections
- Light theme
- **Normálne borders** pre separáciu

**Kontajnery:**
- Mobile: `.mobile-app` → `.mobile-app-content` → `.mobile-app-screen`
- Desktop: `.homepage-container` → `.container` → `.desktop-layout-wrapper`

**Čiary:**
- Mobile: Len horizontálne separátory (header bottom, tabbar top)
- Desktop: Normálne borders všade
