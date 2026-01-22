# Mobile Heatmap - Prázdny priestor pod heatmapou - Analýza

## Problém
Heatmapa končí v ~2/3 výšky obrazovky, pod ňou je čierny prázdny priestor až po navigačný bar.

## Identifikované príčiny

### 1. `containerSize.height` sa meria z `.mobile-treemap-grid`
- Meranie: `containerRef.current.getBoundingClientRect().height` (riadok 258)
- Tento div má `flex: 1` a `height: 100%` (riadok 805-808)
- **Problém**: Ak flex layout ešte nie je vyriešený pri prvom meraní, `containerSize.height` môže byť menšie ako skutočná dostupná výška

### 2. `finalLayoutHeight` používa `height` z `containerSize`
```tsx
const finalLayoutHeight = Math.max(yCursor, height); // riadok 579
```
- `height` je z `containerSize.height` (riadok 479)
- Ak `containerSize.height` je menšie ako skutočná výška, `finalLayoutHeight` bude tiež menší

### 3. Renderovanie používa `containerSize.height` ako minimum
```tsx
height: Math.max(layoutHeight * zoom, containerSize.height), // riadok 875
minHeight: containerSize.height, // riadok 876
```
- Ak `containerSize.height` je nesprávne (menšie), layout div bude menší ako kontajner

### 4. `effectiveHeight` vs `containerSize.height` - nekonzistencia
- V layout výpočte: `const effectiveHeight = availableHeight > 0 ? availableHeight : height;` (riadok 490)
- `effectiveHeight` sa používa len na `baseHeight` výpočet (riadok 491)
- `finalLayoutHeight` používa `height` (z `containerSize`), nie `effectiveHeight`
- **Problém**: `availableHeight` je vypočítané z viewportu, `containerSize.height` je merané z DOM - môžu sa líšiť

### 5. `EXPAND_FACTOR = 1.8` môže byť príliš malý
- `baseHeight = Math.floor(effectiveHeight * EXPAND_FACTOR)` (riadok 491)
- Ak je málo dát, `yCursor` môže byť menší ako `height`
- `Math.max(yCursor, height)` by to malo opraviť, ale len ak `height` je správne

## Riešenie - Implementované

### Oprava 1: ✅ Použiť `effectiveHeight` v `finalLayoutHeight`
**Riadok 579:**
```tsx
// PRED:
const finalLayoutHeight = Math.max(yCursor, height);

// PO:
const finalLayoutHeight = Math.max(yCursor, effectiveHeight);
```
- `effectiveHeight` je správne vypočítané z `availableHeight` alebo `height`
- `availableHeight` je presnejšie pre iOS Safari (používa `visualViewport`)

### Oprava 2: ✅ Zmeniť `useEffect` na `useLayoutEffect` pre meranie `containerSize`
**Riadok 252:**
```tsx
// PRED:
useEffect(() => {
  const el = containerRef.current;
  // ...
}, []);

// PO:
useLayoutEffect(() => {
  const el = containerRef.current;
  // ...
}, []);
```
- `useLayoutEffect` sa spustí pred paint, takže flex layout je už vyriešený
- `containerSize.height` bude presnejšie

### Oprava 3: ✅ V renderi použiť `availableHeight` ako fallback
**Riadok 877-878:**
```tsx
// PRED:
height: Math.max(layoutHeight * zoom, containerSize.height),
minHeight: containerSize.height,

// PO:
height: Math.max(
  layoutHeight * zoom,
  Math.max(containerSize.height, availableHeight || 0)
),
minHeight: Math.max(containerSize.height, availableHeight || 0),
```
- Ak `containerSize.height` je príliš malé (iOS Safari viewport quirks), použije sa `availableHeight`
- Zabezpečí, že layout div má minimálne správnu výšku

## Výsledok

✅ **finalLayoutHeight** používa `effectiveHeight` (presnejšie pre iOS)  
✅ **containerSize** sa meria v `useLayoutEffect` (pred paint, flex layout vyriešený)  
✅ **Renderovanie** používa `availableHeight` ako fallback (zabezpečí minimálnu výšku)  
✅ **Heatmapa** by mala teraz vyplniť celú dostupnú výšku až po navigačný bar
