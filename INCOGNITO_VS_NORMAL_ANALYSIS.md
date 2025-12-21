# 🔍 Analýza: Rozdiel medzi Inkognito a Normálnym režimom

## 📊 Identifikované problémy

### 1. **localStorage Cache (Hlavný problém)**
**Problém:**
- V **normálnom režime** sa načítavajú staré preferencie z localStorage
- V **inkognito režime** nie je localStorage dostupný → používajú sa default hodnoty
- Staré preferencie môžu obsahovať zastarané layout nastavenia

**Dôkaz:**
- `useUserPreferences.ts` načítava preferencie z localStorage bez verzie
- Žiadna migrácia alebo validácia verzie dát
- Staré preferencie môžu mať starý layout (napr. navigácia v headeri namiesto sidebaru)

### 2. **Service Worker Cache**
**Problém:**
- Service Worker môže cache-ovať staré verzie CSS/JS súborov
- V inkognito režime sa Service Worker často neaktivuje
- Staré cacheované súbory môžu mať starý layout

### 3. **Next.js Build Cache**
**Problém:**
- `.next` directory môže obsahovať staré kompilované súbory
- V inkognito režime sa často načítajú nové súbory
- V normálnom režime sa môžu načítať staré cacheované súbory

### 4. **Browser HTTP Cache**
**Problém:**
- Browser môže cache-ovať staré CSS/JS súbory
- V inkognito režime sa cache často ignoruje
- V normálnom režime sa môžu načítať staré súbory

### 5. **React Hydration Mismatch**
**Problém:**
- SSR môže renderovať nový layout
- Client-side môže načítať staré preferencie a renderovať starý layout
- Výsledok: hydration mismatch alebo flash starého layoutu

## 🎯 Riešenie

### 1. **Version-based Preferences Migration**
- Pridať verziu do localStorage preferences
- Automaticky migrovať staré preferencie na novú verziu
- Resetovať preferencie, ak verzia nie je kompatibilná

### 2. **Cache Busting**
- Pridať version hash do CSS/JS súborov
- Service Worker cache versioning
- Next.js build ID v asset URLs

### 3. **Layout Version Check**
- Pridať layout version do preferences
- Ak layout version nie je aktuálna, resetovať layout preferencie
- Zabezpečiť konzistentný layout bez ohľadu na cache

### 4. **Service Worker Update Strategy**
- Agresívnejšia aktualizácia Service Workera
- Automatické vymazanie starých cache pri update
- Version-based cache naming

### 5. **SSR/Client Consistency**
- Zabezpečiť, aby SSR a client renderovali rovnaký layout
- Použiť `suppressHydrationWarning` len tam, kde je to nevyhnutné
- Validovať preferencie pred použitím

## 📝 Implementácia

### Krok 1: Preferences Versioning
```typescript
const PREFERENCES_VERSION = '2.0.0'; // Increment on layout changes
const LAYOUT_VERSION = '2.0.0'; // Increment on layout changes
```

### Krok 2: Migration Logic
```typescript
function migratePreferences(oldPrefs: any, version: string) {
  if (version < '2.0.0') {
    // Reset layout preferences for new sidebar layout
    delete oldPrefs.layoutPosition;
    delete oldPrefs.navigationStyle;
  }
  return oldPrefs;
}
```

### Krok 3: Cache Busting
```typescript
// next.config.ts
const buildId = process.env.BUILD_ID || Date.now().toString();
```

### Krok 4: Service Worker Update
```javascript
// sw.js
const CACHE_VERSION = '2.0.0';
const CACHE_NAME = `premarketprice-v${CACHE_VERSION}`;
```

## ✅ Očakávané výsledky

Po implementácii:
- ✅ Konzistentné zobrazenie v inkognito aj normálnom režime
- ✅ Automatická migrácia starých preferencií
- ✅ Žiadne staré cacheované súbory
- ✅ Rovnaký layout bez ohľadu na cache stav

