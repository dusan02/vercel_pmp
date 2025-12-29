# 📱 Analýza a Návrhy Riešení pre Heatmapu na Mobiloch

## 🔍 Aktuálny Stav

### Čo funguje:

- ✅ Vertikálne scrollovanie je povolené (`overflow-y: auto`)
- ✅ Tooltip je skrytý na mobile (šetrí miesto)
- ✅ Touch-friendly tiles (min 40px, small tiles 44px)
- ✅ Canvas mode je rýchlejší pre veľké množstvo dát

### Problémy:

1. **Treemap algoritmus je horizontálny**

   - D3 Treemap je navrhnutý pre šírku > výška
   - Na mobile (portrait) je šírka < výška → úzke, vysoké bloky
   - Malé dlaždice sú ťažko čitateľné a klikateľné

2. **Nedostatočná interaktivita**

   - Chýba pan & zoom funkcionalita
   - Nie je možné "priblížiť" sa na konkrétny sektor
   - Vertikálne scrollovanie môže byť neintuitívne

3. **Informačná hustota**

   - Na malých dlaždiciach sa text nezobrazuje (< 160px²)
   - Používateľ nevie, čo je na malých blokoch
   - Chýba alternatívny spôsob zobrazenia

4. **Výkon**
   - Canvas mode je rýchlejší, ale chýba interaktivita
   - DOM mode má lepšiu interaktivitu, ale je pomalší

---

## 💡 Návrhy Riešení

### **Riešenie 1: Pan & Zoom s Touch Gestures** ⭐ (Odporúčané)

**Koncept:**

- Povoliť používateľovi posúvať (pan) a zoomovať (pinch-to-zoom) heatmapu
- Heatmapa sa zobrazí v pôvodnej veľkosti, používateľ si ju "priblíži" podľa potreby

**Výhody:**

- ✅ Zachováva pôvodný layout a algoritmus
- ✅ Používateľ má kontrolu nad zobrazením
- ✅ Štandardné mobile gesty (pinch-to-zoom, pan)
- ✅ Kompatibilné s existujúcim kódom

**Nevýhody:**

- ⚠️ Vyžaduje implementáciu touch gesture handling
- ⚠️ Môže byť menej intuitívne pre nových používateľov

**Implementácia:**

- Použiť `react-use-gesture` alebo `@use-gesture/react` pre touch gestures
- Transform CSS (`transform: scale() translate()`) pre zoom a pan
- Minimálny zoom: 1x (pôvodná veľkosť)
- Maximálny zoom: 3-5x (podľa potreby)
- Reset button pre návrat na pôvodný zoom

**UX Flow:**

1. Používateľ otvorí heatmapu → vidí celú mapu v zmenšenej veľkosti
2. Tap na dlaždicu → zobrazí detail (tooltip alebo modal)
3. Pinch-to-zoom → priblíži sa na konkrétnu oblasť
4. Pan (drag) → posúva sa po mape
5. Double-tap → reset na pôvodný zoom

---

### **Riešenie 2: Vertical Treemap Layout** ⭐⭐ (Najlepšie pre UX)

**Koncept:**

- Upraviť D3 Treemap algoritmus pre vertikálny layout na mobile
- Namiesto horizontálneho rozdelenia (šírka > výška) → vertikálne rozdelenie (výška > šírka)

**Výhody:**

- ✅ Lepšie využitie vertikálneho priestoru na mobile
- ✅ Širšie dlaždice = lepšia čitateľnosť textu
- ✅ Prirodzenejšie scrollovanie (vertikálne)
- ✅ Lepšie pre touch interakcie

**Nevýhody:**

- ⚠️ Vyžaduje úpravu D3 Treemap algoritmu
- ⚠️ Iný layout na mobile vs desktop (môže byť mätúce)

**Implementácia:**

- Detekcia mobile (`window.innerWidth < 768px`)
- Pre mobile: zmeniť `treemap().size([height, width])` → `treemap().size([width, height])`
- Alebo použiť `treemapBinary` alebo vlastný algoritmus pre vertikálne rozdelenie
- Upraviť padding a medzery pre vertikálny layout

**UX Flow:**

1. Na mobile sa automaticky použije vertikálny layout
2. Sektory sú usporiadané vertikálne (jeden pod druhým)
3. Firmy v sektore sú usporiadané horizontálne (vedľa seba)
4. Prirodzené vertikálne scrollovanie

---

### **Riešenie 3: Sector-Based Navigation** ⭐⭐⭐ (Najlepšie pre kompletnosť)

**Koncept:**

- Na mobile zobraziť sektory ako zoznam/karty
- Po kliknutí na sektor → zobrazí sa heatmapa len pre tento sektor (zoom)
- Používateľ môže prechádzať medzi sektormi

**Výhody:**

- ✅ Kompletný prehľad všetkých sektorov
- ✅ Jednoduchá navigácia (tap na sektor)
- ✅ Lepšie využitie priestoru (každý sektor má viac miesta)
- ✅ Lepšia čitateľnosť (väčšie dlaždice v zoomovanom sektore)

**Nevýhody:**

- ⚠️ Vyžaduje nový UI komponent (sektorový zoznam)
- ⚠️ Dva módy zobrazenia (sektorový zoznam vs heatmapa)

**Implementácia:**

- **Mobile View 1**: Zoznam sektorov (karty s názvom, počtom firiem, celkovým market cap)
- **Mobile View 2**: Heatmapa pre vybraný sektor (zoom na sektor)
- Toggle button medzi "All Sectors" a "Sector View"
- Breadcrumb navigation (All → Sector → Back)

**UX Flow:**

1. Používateľ otvorí heatmapu → vidí zoznam sektorov
2. Tap na sektor → zobrazí sa heatmapa len pre tento sektor
3. Tap na dlaždicu → zobrazí detail firmy
4. "Back" button → návrat na zoznam sektorov

---

### **Riešenie 4: Hybrid List + Heatmap View** ⭐⭐

**Koncept:**

- Na mobile ponúknuť dva módy zobrazenia:
  - **List View**: Zoznam firiem s detailmi (ako tabuľka, ale vertikálne)
  - **Heatmap View**: Tradičná heatmapa (s pan & zoom)

**Výhody:**

- ✅ Používateľ si vyberie preferovaný mód
- ✅ List view = kompletný prehľad všetkých firiem
- ✅ Heatmap view = vizuálny prehľad

**Nevýhody:**

- ⚠️ Vyžaduje dva rôzne komponenty
- ⚠️ Môže byť mätúce pre používateľa

**Implementácia:**

- Toggle button: "List" ↔ "Heatmap"
- List View: Zoznam firiem s farbou podľa % change
- Heatmap View: Tradičná heatmapa s pan & zoom

---

### **Riešenie 5: Responsive Aspect Ratio** ⭐

**Koncept:**

- Upraviť aspect ratio heatmapy pre mobile
- Namiesto `width: 100%, height: 100%` → `width: 100%, height: auto` s minimálnou výškou

**Výhody:**

- ✅ Jednoduchá implementácia
- ✅ Zachováva pôvodný algoritmus

**Nevýhody:**

- ⚠️ Menej efektívne využitie priestoru
- ⚠️ Stále môže byť problém s malými dlaždicami

---

## 🎯 Odporúčané Kombinované Riešenie

### **Fáza 1: Pan & Zoom (Krátkodobé)** ⭐

- Implementovať touch gestures pre pan & zoom
- Rýchle riešenie, zachováva existujúci kód
- Používateľ má kontrolu nad zobrazením

### **Fáza 2: Sector-Based Navigation (Strednodobé)** ⭐⭐⭐

- Pridať sektorový zoznam na mobile
- Lepšia navigácia a kompletnosť
- Lepšie využitie priestoru

### **Fáza 3: Vertical Treemap (Dlhodobé)** ⭐⭐

- Upraviť D3 algoritmus pre vertikálny layout
- Optimálne pre mobile UX
- Najlepšie využitie vertikálneho priestoru

---

## 📊 Porovnanie Riešení

| Riešenie          | Komplexnosť | UX         | Kompletnosť | Výkon    |
| ----------------- | ----------- | ---------- | ----------- | -------- |
| Pan & Zoom        | ⭐⭐        | ⭐⭐⭐     | ⭐⭐⭐      | ⭐⭐⭐   |
| Vertical Treemap  | ⭐⭐⭐      | ⭐⭐⭐⭐   | ⭐⭐⭐      | ⭐⭐⭐   |
| Sector Navigation | ⭐⭐⭐      | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐  | ⭐⭐⭐⭐ |
| Hybrid View       | ⭐⭐⭐⭐    | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐  | ⭐⭐⭐   |
| Aspect Ratio      | ⭐          | ⭐⭐       | ⭐⭐        | ⭐⭐⭐   |

---

## 🔧 Technické Detaily

### Pre Pan & Zoom:

```typescript
// Použiť react-use-gesture alebo @use-gesture/react
import { useGesture } from "@use-gesture/react";

const bind = useGesture({
  onPinch: ({ offset: [scale] }) => setZoom(scale),
  onDrag: ({ offset: [x, y] }) => setPan({ x, y }),
});
```

### Pre Vertical Treemap:

```typescript
// Detekcia mobile
const isMobile = window.innerWidth < 768px;

// Upraviť size pre mobile
const treemapSize = isMobile
  ? [height, width]  // Vertikálny layout
  : [width, height]; // Horizontálny layout
```

### Pre Sector Navigation:

```typescript
// Nový komponent: SectorList
<SectorList
  sectors={sectors}
  onSectorClick={(sector) => setZoomedSector(sector)}
/>;

// Existujúci zoom funkcionalita
{
  zoomedSector && <MarketHeatmap data={filteredBySector} />;
}
```

---

## 📝 Záver

**Najlepšie riešenie pre kompletnosť:**

1. **Sector-Based Navigation** - poskytuje kompletný prehľad a jednoduchú navigáciu
2. **Pan & Zoom** - doplňujúca funkcionalita pre detailný pohľad
3. **Vertical Treemap** - optimalizácia layoutu pre mobile

**Odporúčaný postup:**

1. Začať s **Pan & Zoom** (rýchle riešenie)
2. Pridať **Sector-Based Navigation** (lepšia UX)
3. Eventuálne implementovať **Vertical Treemap** (optimálne riešenie)
