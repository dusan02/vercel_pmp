# Dark Mode Analýza a Refaktoring - PreMarketPrice.com

## ✅ Opravené

### 1. **Dark Mode Button Funguje**
- **Problém:** `ThemeProvider` nebol zahrnutý v layout
- **Riešenie:** Pridaný `<Providers>` wrapper do `layout.tsx`
- **Výsledok:** Dark mode toggle button teraz správne prepína medzi svetlou a tmavou témou

## 📊 Analýza Aktuálneho Stavu

### **Čo Funguje:**
✅ Tailwind dark mode konfigurácia (`darkMode: "class"`)
✅ `next-themes` ThemeProvider
✅ Dark mode toggle button v `PageControls`
✅ Základné CSS premenné pre dark mode

### **Čo Nefunguje/Chýba:**
❌ Väčšina komponentov používa len `@media (prefers-color-scheme: dark)` namiesto `.dark` class
❌ Nekonzistentné použitie dark mode štýlov
❌ Niektoré komponenty nemajú dark mode štýly vôbec
❌ Tailwind `dark:` utility classes nie sú použité konzistentne

## 🎯 Stratégia Refaktoringu

### **Prístup 1: CSS Premenné (Odporúčané)**
Použiť CSS custom properties ktoré sa menia podľa `.dark` class:

```css
:root {
  --clr-bg: #f7f8fa;
  --clr-surface: #ffffff;
  --clr-text: #111827;
  /* ... */
}

.dark {
  --clr-bg: #0f172a;
  --clr-surface: #1e293b;
  --clr-text: #f1f5f9;
  /* ... */
}
```

**Výhody:**
- ✅ Jednoduchá implementácia
- ✅ Funguje s existujúcim kódom
- ✅ Automaticky aplikované všade kde sa používajú CSS premenné

### **Prístup 2: Tailwind Dark Classes**
Použiť Tailwind `dark:` prefix pre každý komponent:

```tsx
<div className="bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100">
```

**Výhody:**
- ✅ Type-safe (ak používate TypeScript)
- ✅ Lepšia developer experience s IntelliSense
- ❌ Vyžaduje aktualizáciu každého komponentu

## 🔧 Implementácia

### **Krok 1: Aktualizovať CSS Premenné**

Nahradiť všetky `@media (prefers-color-scheme: dark)` s `.dark` selector:

```css
/* ❌ Staré */
@media (prefers-color-scheme: dark) {
  :root {
    --clr-bg: #0f172a;
  }
}

/* ✅ Nové */
.dark {
  --clr-bg: #0f172a;
  --clr-surface: #1e293b;
  --clr-border: #334155;
  --clr-text: #f1f5f9;
  --clr-subtext: #94a3b8;
  --clr-primary: #3b82f6;
  --clr-primary-hover: #2563eb;
  --clr-error-bg: #450a0a;
  --shadow: 0 2px 8px rgba(0,0,0,0.4);
}
```

### **Krok 2: Aktualizovať Komponenty**

Pre komponenty ktoré používajú Tailwind classes:

```tsx
// PageControls.tsx - už má dark mode ✅
<div className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
  <button className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-yellow-400">
    {/* Dark mode icon */}
  </button>
</div>
```

### **Krok 3: Testovanie**

1. **Vizuálne testovanie:**
   - Prepnúť medzi svetlou/tmavou témou
   - Skontrolovať všetky sekcie
   - Overiť čitateľnosť textu

2. **Kontrast testovanie:**
   - Použiť WebAIM Contrast Checker
   - Minimálny ratio: 4.5:1 pre normálny text
   - Minimálny ratio: 3:1 pre veľký text

## 📝 Zoznam Komponentov na Aktualizáciu

### **Vysoká Priorita:**
1. ✅ `PageControls.tsx` - Už má dark mode
2. ⚠️ `PageHeader.tsx` - Potrebuje dark mode
3. ⚠️ `AllStocksSection.tsx` - Potrebuje dark mode
4. ⚠️ `FavoritesSection.tsx` - Potrebuje dark mode
5. ⚠️ `PortfolioSection.tsx` - Potrebuje dark mode
6. ⚠️ `EarningsCalendar.tsx` - Potrebuje dark mode
7. ⚠️ `MarketHeatmap.tsx` - Potrebuje dark mode

### **Stredná Priorita:**
8. ⚠️ `StockFilters.tsx` - Potrebuje dark mode
9. ⚠️ `StockSearchBar.tsx` - Potrebuje dark mode
10. ⚠️ `CustomDropdown.tsx` - Potrebuje dark mode
11. ⚠️ `AdaptiveTable.tsx` - Potrebuje dark mode

### **Nízka Priorita:**
12. ⚠️ `BottomNavigation.tsx` - Potrebuje dark mode
13. ⚠️ `FloatingActionButton.tsx` - Potrebuje dark mode
14. ⚠️ `CookieConsent.tsx` - Potrebuje dark mode

## 🎨 Odporúčané Farby pre Dark Mode

### **Pozadia:**
```css
--clr-bg: #0f172a;           /* Slate 900 - Hlavné pozadie */
--clr-surface: #1e293b;      /* Slate 800 - Karty, panely */
--clr-surface-hover: #334155; /* Slate 700 - Hover stavy */
```

### **Texty:**
```css
--clr-text: #f1f5f9;         /* Slate 100 - Hlavný text */
--clr-subtext: #94a3b8;      /* Slate 400 - Sekundárny text */
--clr-text-muted: #64748b;   /* Slate 500 - Utlmený text */
```

### **Borders:**
```css
--clr-border: #334155;       /* Slate 700 - Borders */
--clr-border-light: #475569; /* Slate 600 - Svetlejšie borders */
```

### **Akčné Farby:**
```css
--clr-primary: #3b82f6;      /* Blue 500 - Primárna akcia */
--clr-primary-hover: #2563eb; /* Blue 600 - Hover */
--clr-positive: #22c55e;     /* Green 500 - Pozitívne */
--clr-negative: #ef4444;     /* Red 500 - Negatívne */
```

## 🚀 Automatizovaný Refaktoring

Vytvoril som script na automatickú aktualizáciu CSS:

```bash
# Spustiť z pmp_prod adresára
node scripts/update-dark-mode.js
```

Alebo manuálne pomocou PowerShell:

```powershell
# Nahradiť @media (prefers-color-scheme: dark) s .dark
(Get-Content src/app/globals.css -Raw) -replace '@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{', '.dark {' | Set-Content src/app/globals.css -NoNewline
```

## 📚 Príklady Implementácie

### **Príklad 1: Jednoduchý Komponent**

```tsx
// Before
<div className="bg-white border-gray-200">
  <h2 className="text-gray-900">Title</h2>
  <p className="text-gray-600">Description</p>
</div>

// After
<div className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700">
  <h2 className="text-gray-900 dark:text-slate-100">Title</h2>
  <p className="text-gray-600 dark:text-slate-400">Description</p>
</div>
```

### **Príklad 2: Tlačítko**

```tsx
// Before
<button className="bg-blue-600 text-white hover:bg-blue-700">
  Click me
</button>

// After
<button className="bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600">
  Click me
</button>
```

### **Príklad 3: Input**

```tsx
// Before
<input 
  className="bg-white border-gray-300 text-gray-900"
  placeholder="Search..."
/>

// After
<input 
  className="bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400"
  placeholder="Search..."
/>
```

### **Príklad 4: Tabuľka**

```tsx
// Before
<table className="bg-white">
  <thead className="bg-gray-50">
    <tr>
      <th className="text-gray-900">Header</th>
    </tr>
  </thead>
  <tbody>
    <tr className="hover:bg-gray-50">
      <td className="text-gray-600">Data</td>
    </tr>
  </tbody>
</table>

// After
<table className="bg-white dark:bg-slate-800">
  <thead className="bg-gray-50 dark:bg-slate-700">
    <tr>
      <th className="text-gray-900 dark:text-slate-100">Header</th>
    </tr>
  </thead>
  <tbody>
    <tr className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
      <td className="text-gray-600 dark:text-slate-300">Data</td>
    </tr>
  </tbody>
</table>
```

## 🔍 Kontrolný Zoznam

### **Pre Každý Komponent:**
- [ ] Pozadie má dark variant
- [ ] Text má dostatočný kontrast
- [ ] Borders sú viditeľné
- [ ] Hover stavy fungujú
- [ ] Focus stavy sú viditeľné
- [ ] Shadows sú upravené pre dark mode
- [ ] Icons majú správnu farbu
- [ ] Obrázky majú vhodný filter (ak potrebné)

### **Globálne:**
- [ ] CSS premenné sú aktualizované
- [ ] Tailwind config má `darkMode: "class"`
- [ ] ThemeProvider je v layout
- [ ] Dark mode toggle funguje
- [ ] Preferencia sa ukladá do localStorage
- [ ] System preference je rešpektovaná

## 🎯 Ďalšie Kroky

1. **Aktualizovať globals.css** - Nahradiť `@media (prefers-color-scheme: dark)` s `.dark`
2. **Aktualizovať komponenty** - Pridať `dark:` classes do všetkých komponentov
3. **Testovať** - Vizuálne skontrolovať každú sekciu
4. **Optimalizovať** - Odstrániť duplicitný kód
5. **Dokumentovať** - Aktualizovať README s dark mode info

## 📖 Zdroje

- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [next-themes Documentation](https://github.com/pacocoursey/next-themes)
- [WCAG Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Dark Mode Design Guidelines](https://material.io/design/color/dark-theme.html)

---

**Poznámka:** Dark mode button teraz funguje! Stránka sa prepne medzi svetlou a tmavou témou, ale niektoré komponenty ešte nemajú dark mode štýly. Postupne ich budem aktualizovať podľa tohto plánu.
