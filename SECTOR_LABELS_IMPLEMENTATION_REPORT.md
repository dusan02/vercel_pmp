# 📊 Sector Labels Implementation Report

## Prehľad
Sector labels sú názvy sektorov (napr. "TECHNOLOGY", "FINANCIAL SERVICES") zobrazené v prázdnej ploche nad každým sektorom v heatmape. Implementácia zabezpečuje, že labels sú viditeľné, správne umiestnené a nezasahujú do dlaždíc spoločností.

---

## 1. Konfigurácia (`src/lib/utils/heatmapConfig.ts`)

### SECTOR_LABEL konštanty:
```typescript
SECTOR_LABEL: {
    FONT_SIZE: 8.4,              // 60% z pôvodných 14px
    PADDING: '2px 6px',          // Vnútorný padding labelu
    TOP: 2,                      // Offset od vrchu (nepoužíva sa pri aktuálnej implementácii)
    LEFT: 6,                     // Offset zľava pre label
    LETTER_SPACING: '0.08em',    // Rozostup medzi písmenami
    BG_OPACITY: 0.85,            // Priehľadnosť čierneho pozadia (85%)
    HEIGHT: 18,                  // Výška prázdnej plochy nad sektorom (v pixeloch)
}
```

**Kľúčové hodnoty:**
- `HEIGHT: 18px` - Definuje výšku prázdnej plochy, ktorá sa vytvorí nad každým sektorom
- `FONT_SIZE: 8.4px` - Zmenšené na 60% pôvodnej veľkosti pre kompaktnejší vzhľad

---

## 2. Treemap Layout - Vytvorenie priestoru (`src/components/MarketHeatmap.tsx`)

### D3 Treemap paddingTop:
```typescript
.paddingTop(function (node) {
  if (node.depth === 1) {
    // Sektor → pridaj priestor pre label
    return LAYOUT_CONFIG.SECTOR_LABEL.HEIGHT; // 18px
  }
  return 0;
})
```

**Ako to funguje:**
- D3 treemap `paddingTop` vytvára priestor **vnútri** uzla (sektora)
- Pre sektory (`depth === 1`) sa pridá 18px padding na vrchu
- Tento padding vytvorí prázdnu plochu, kde sa zobrazia labels
- `y0` súradnica sektora už obsahuje tento padding space

**Dôležité:**
- `paddingTop` sa aplikuje len na sektory, nie na firmy
- Priestor je vytvorený **vnútri** sektora, nie nad ním
- To znamená, že `y0` je začiatok sektora vrátane padding space

---

## 3. Renderovanie Labels - DOM Mode

### Pozícia a štruktúra:
```typescript
{filteredNodes
  .filter((node) => node.depth === 1) // Iba Sektory
  .map((node) => {
    const { x0, y0, x1, y1 } = node as TreemapNode;
    const data = node.data as HierarchyData;
    const nodeWidth = x1 - x0;
    const scaledWidth = nodeWidth * scale;
    const labelHeight = LAYOUT_CONFIG.SECTOR_LABEL.HEIGHT; // 18px

    // Podmienka zobrazenia
    const minSizeForLabel = 50;
    const showLabel = scaledWidth > minSizeForLabel && scale > 0 && treemapBounds !== null;

    if (!showLabel) return null;

    return (
      <div
        style={{
          left: x0 * scale + offset.x,
          top: y0 * scale + offset.y,  // Pozícia na začiatku sektora (v padding space)
          width: nodeWidth * scale,
          height: labelHeight,        // 18px
          zIndex: 100,                 // Veľmi vysoký z-index
          display: 'flex',
          alignItems: 'center',
          paddingLeft: LAYOUT_CONFIG.SECTOR_LABEL.LEFT, // 6px
          backgroundColor: 'transparent',
        }}
      >
        <div
          style={{
            fontSize: `${LAYOUT_CONFIG.SECTOR_LABEL.FONT_SIZE}px`, // 8.4px
            fontWeight: 'bold',
            color: '#FFFFFF',
            textShadow: '...', // Viacnásobný text shadow pre čitateľnosť
            padding: LAYOUT_CONFIG.SECTOR_LABEL.PADDING, // '2px 6px'
            backgroundColor: `rgba(0, 0, 0, ${LAYOUT_CONFIG.SECTOR_LABEL.BG_OPACITY})`, // 85% opacity
            borderRadius: '2px',
            letterSpacing: LAYOUT_CONFIG.SECTOR_LABEL.LETTER_SPACING, // '0.08em'
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
        >
          {data.name} // Názov sektora (napr. "TECHNOLOGY")
        </div>
      </div>
    );
  })}
```

**Kľúčové body:**
- **Render order**: Labels sa renderujú **PO** sektorových border divoch, aby boli navrchu
- **Pozícia**: `top: y0 * scale + offset.y` - na začiatku sektora (v padding space)
- **Z-index**: `100` - zabezpečuje, že labels sú nad všetkým ostatným
- **Podmienka zobrazenia**: Label sa zobrazí len ak `scaledWidth > 50px` a `scale > 0`

---

## 4. Renderovanie Labels - Canvas Mode

Canvas mode používa **identickú** implementáciu ako DOM mode:
- Labels sa renderujú **PO** `<CanvasHeatmap>` komponente
- Rovnaká pozícia, styling a podmienky zobrazenia
- Rovnaký z-index (100)

**Rozdiel:** V canvas mode sa labels renderujú ako overlay divy nad canvas elementom.

---

## 5. Styling a Vizuálny vzhľad

### Label container:
- **Pozícia**: `absolute` positioning
- **Výška**: 18px (SECTOR_LABEL.HEIGHT)
- **Šírka**: Rovnaká ako šírka sektora (`nodeWidth * scale`)
- **Background**: Transparent (prázdna plocha)
- **Z-index**: 100 (nad všetkým)

### Label text:
- **Font size**: 8.4px (60% z pôvodných 14px)
- **Font weight**: Bold
- **Color**: #FFFFFF (biela)
- **Text shadow**: Viacnásobný čierny shadow pre čitateľnosť na farebných pozadiach
- **Background**: `rgba(0, 0, 0, 0.85)` - polopriehľadné čierne pozadie
- **Padding**: `2px 6px`
- **Text transform**: `uppercase` - všetky písmená veľké
- **Letter spacing**: `0.08em` - mierne rozostupy medzi písmenami

---

## 6. Pozíciovanie a Koordináty

### Ako funguje pozícia:

1. **D3 Treemap Layout:**
   - `paddingTop: 18px` vytvorí priestor vnútri sektora
   - `y0` je začiatok sektora **vrátane** padding space
   - `y1` je koniec sektora

2. **Label pozícia:**
   ```typescript
   top: y0 * scale + offset.y
   ```
   - `y0` už obsahuje padding space, takže label je na správnom mieste
   - `scale` - škálovanie heatmapy
   - `offset` - offset pre centrovanie/posun

3. **Výška label area:**
   ```typescript
   height: LAYOUT_CONFIG.SECTOR_LABEL.HEIGHT // 18px
   ```
   - Presne zodpovedá `paddingTop` hodnote
   - Zabezpečuje, že label je v správnom priestore

---

## 7. Podmienky Zobrazenia

Label sa zobrazí len ak:
1. `scaledWidth > 50px` - Sektor je dostatočne široký
2. `scale > 0` - Scale je platný (heatmapa je načítaná)
3. `treemapBounds !== null` - Treemap layout je pripravený

**Dôvod:** Zabráni zobrazeniu labels na príliš malých sektoroch alebo počas načítavania.

---

## 8. Render Order (Kritické pre viditeľnosť)

### DOM Mode:
1. Tiles (firmy) - `z-index: 1`
2. Sector borders - `z-index: 10`
3. **Sector labels - `z-index: 100`** ← Renderované posledné

### Canvas Mode:
1. Canvas element (firmy)
2. Sector borders (overlay) - `z-index: 10`
3. **Sector labels (overlay) - `z-index: 100`** ← Renderované posledné

**Dôležité:** Labels musia byť renderované **PO** všetkých ostatných elementoch, aby boli viditeľné.

---

## 9. Problémy a Riešenia

### Problém 1: Labels neboli viditeľné
**Riešenie:** 
- Zvýšený z-index z 12 na 100
- Labels renderované PO sektoroch/canvas

### Problém 2: Labels zasahovali do predchádzajúceho sektora
**Riešenie:**
- Pozícia zmenená z `y0 - labelHeight` na `y0`
- D3 `paddingTop` už vytvoril správny priestor

### Problém 3: Labels zmizli po refreshi
**Riešenie:**
- Pridaná kontrola `treemapBounds !== null`
- Znížený threshold z 80px na 50px
- Zjednodušené podmienky zobrazenia

### Problém 4: Font bol príliš veľký
**Riešenie:**
- Zmenšený z 14px na 8.4px (60% pôvodnej veľkosti)

### Problém 5: Prázdna plocha bola príliš vysoká
**Riešenie:**
- Znížená `HEIGHT` z 28px na 18px

---

## 10. Súbory a Lokácie

### Konfigurácia:
- `src/lib/utils/heatmapConfig.ts` - `LAYOUT_CONFIG.SECTOR_LABEL`

### Implementácia:
- `src/components/MarketHeatmap.tsx`:
  - Riadok ~329: `paddingTop` konfigurácia
  - Riadok ~601-650: Canvas mode labels
  - Riadok ~722-771: DOM mode labels

---

## 11. Technické Detaily

### D3 Treemap paddingTop:
- Vytvára priestor **vnútri** uzla, nie nad ním
- Pre sektory: 18px padding na vrchu
- Pre firmy: 0px (žiadny padding)

### Koordináty:
- `x0, y0` - ľavý horný roh sektora (vrátane padding)
- `x1, y1` - pravý dolný roh sektora
- `y0` je správna pozícia pre label (už obsahuje padding space)

### Scale a Offset:
- `scale` - škálovanie heatmapy podľa veľkosti kontajnera
- `offset` - posun pre centrovanie/alignment
- Labels používajú rovnaké `scale` a `offset` ako sektory

---

## 12. Výsledok

✅ **Labels sú viditeľné** - z-index 100, renderované posledné
✅ **Správne umiestnené** - v prázdnej ploche nad sektormi (18px výška)
✅ **Nezasahujú** - neprekrývajú dlaždice ani predchádzajúce sektory
✅ **Kompaktné** - menší font (8.4px) a nižšia plocha (18px)
✅ **Konzistentné** - funguje v DOM aj Canvas režime

---

## 13. Možné Vylepšenia

1. **Dynamická výška** - Upraviť `HEIGHT` podľa font size
2. **Responsive font** - Upraviť font size podľa šírky sektora
3. **Animácie** - Pridať fade-in animáciu pri načítaní
4. **Hover efekty** - Zvýrazniť label pri hover nad sektorom
5. **Truncation** - Skrátiť dlhé názvy sektorov s "..."

---

*Report vytvorený: 2024*
*Posledná aktualizácia: Po implementácii sector labels s padding-top priestorom*

