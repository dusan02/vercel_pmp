# 🔧 Fix: Čierny priestor medzi heatmapou a navigáciou na mobile

## 📋 Problém

Na mobilných zariadeniach sa medzi heatmapou a spodnou navigáciou zobrazoval čierny priestor. Tento priestor sa zmenšoval, keď sa zobrazil CookieConsent banner, a zväčšoval sa, keď sa banner skryl.

### Symptómy:
- Čierny priestor medzi heatmapou a navigáciou
- Priestor sa menil v závislosti od viditeľnosti CookieConsent banneru
- Heatmapa nezaberala celú dostupnú obrazovku
- Po načítaní sa heatmapa nezobrazovala na celú obrazovku

## 🔍 Analýza príčiny

### Root Cause:
1. **CookieConsent banner** je `fixed` element s `bottom: calc(72px + env(safe-area-inset-bottom))`
2. Heatmapa mala **rezervovaný padding-bottom/margin-bottom**, ktorý vytváral čierny priestor
3. Keď sa banner zobrazil, "vyplnil" tento rezervovaný priestor
4. Keď sa banner skryl, rezervovaný priestor zostal prázdny (čierny)

### Dôležité zistenie:
CookieConsent banner je `position: fixed`, čo znamená, že **nezaberie miesto v layout flow**. Preto heatmapa nemusí rezervovať priestor pre banner.

## ✅ Riešenie

### 1. Odstránenie padding-bottom/margin-bottom z heatmap kontajnerov

**Súbor:** `src/app/globals.css`

#### a) `.mobile-app-screen.screen-heatmap`
```css
.mobile-app-screen.screen-heatmap {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  padding: 0 !important;
  padding-bottom: 0 !important; /* CRITICAL: No padding-bottom */
  margin: 0 !important;
  margin-bottom: 0 !important; /* CRITICAL: No margin-bottom */
  /* ... */
}
```

#### b) `.mobile-treemap-wrapper`
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  margin: 0 !important;
  padding: 0 !important;
  padding-bottom: 0 !important; /* CRITICAL: No padding-bottom */
  box-sizing: border-box !important;
  overflow: hidden;
  position: relative;
}
```

#### c) `.mobile-treemap-grid`
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  padding-bottom: 0 !important; /* CRITICAL: No padding-bottom */
  position: relative;
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  box-sizing: border-box !important;
}
```

### 2. Potvrdenie, že CookieConsent je fixed

**Súbor:** `src/components/CookieConsent.tsx`

```tsx
<div
  className="fixed left-0 right-0 z-[2000] p-4"
  style={{
    // CRITICAL: Fixed positioning means this doesn't affect layout flow
    bottom: 'calc(72px + env(safe-area-inset-bottom))',
    backgroundColor: 'var(--clr-bg)',
    borderTop: '1px solid var(--clr-border)',
    boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.05)',
    // Ensure banner doesn't create layout space reservation
    pointerEvents: 'auto',
  }}
>
```

## 🎯 Výsledok

### Pred:
- ❌ Čierny priestor medzi heatmapou a navigáciou
- ❌ Priestor sa menil v závislosti od viditeľnosti CookieConsent banneru
- ❌ Heatmapa nezaberala celú dostupnú obrazovku

### Po:
- ✅ Heatmapa siaha až po navigáciu bez čierneho priestoru
- ✅ CookieConsent banner nezmení layout heatmapy (je `fixed`)
- ✅ Heatmapa sa zobrazí na celú obrazovku pri načítaní
- ✅ Používateľ môže scrollovať dole v heatmape

## 🔧 Technické detaily

### Layout Flow:
```
.mobile-app (100vh)
  └── .mobile-app-content.is-heatmap (flex: 1, padding-bottom: 0)
      └── .mobile-app-screen.screen-heatmap (position: fixed, bottom: 0)
          └── .mobile-treemap-wrapper (flex: 1, padding-bottom: 0)
              └── .mobile-treemap-grid (flex: 1, padding-bottom: 0)
                  └── [heatmap content]
```

### CookieConsent Banner:
- `position: fixed` - nezaberie miesto v layout flow
- `bottom: calc(72px + env(safe-area-inset-bottom))` - umiestnený nad navigáciou
- `z-index: 2000` - nad heatmapou, ale pod navigáciou (z-index: 9999)

### Kľúčové princípy:
1. **Fixed elements nezabierajú miesto v layout flow** - netreba rezervovať priestor
2. **Heatmapa musí siahať až po navigáciu** - `bottom: 0` na `.screen-heatmap`
3. **Žiadny padding-bottom/margin-bottom** - heatmapa sa musí rozprestrieť na celú dostupnú výšku

## 📝 Súvisiace súbory

- `src/app/globals.css` - CSS pravidlá pre heatmap layout
- `src/components/CookieConsent.tsx` - CookieConsent banner komponent
- `src/components/MobileTreemap.tsx` - Heatmap komponent

## 🧪 Testovanie

### Scenáre:
1. **Načítanie stránky v inkognito okne:**
   - ✅ Heatmapa sa zobrazí na celú obrazovku
   - ✅ Žiadny čierny priestor medzi heatmapou a navigáciou
   - ✅ CookieConsent banner sa zobrazí nad navigáciou

2. **Po odkliknutí CookieConsent banneru:**
   - ✅ Banner sa skryje
   - ✅ Heatmapa zostane na celú obrazovku
   - ✅ Žiadny čierny priestor sa nezobrazí

3. **Scrollovanie v heatmape:**
   - ✅ Heatmapa sa správne scrolluje
   - ✅ Navigácia zostáva viditeľná na spodku

## 🚀 Deployment

Zmeny sú pripravené na commit a push. Žiadne breaking changes, len CSS úpravy pre lepší UX.

---

**Dátum:** 2024-01-XX  
**Autor:** AI Assistant  
**Status:** ✅ Implementované a testované
