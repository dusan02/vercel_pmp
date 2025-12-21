# 🔧 Oprava: Konzistentné zobrazenie (Inkognito vs Normálny režim)

## 📋 Problém

**Symptómy:**
- V **inkognito režime**: Navigácia je vpravo (sidebar) - správne
- V **normálnom režime**: Navigácia môže byť v headeri alebo duplikovaná - nesprávne

**Príčina:**
1. **localStorage cache** - Staré preferencie obsahujú starý layout
2. **Service Worker cache** - Staré CSS/JS súbory s predchádzajúcim layoutom
3. **Browser HTTP cache** - Staré súbory cacheované v browseri
4. **Žiadna verzia preferencií** - Nemožno detekovať, či sú preferencie aktuálne

## ✅ Riešenie

### 1. **Version-based Preferences Migration**

**Implementované:**
- `PREFERENCES_VERSION = '2.0.0'` - Verzia štruktúry preferencií
- `LAYOUT_VERSION = '2.0.0'` - Verzia layoutu (sidebar position)
- Automatická migrácia pri zmene verzie
- Reset layout preferencií pri zmene layout verzie

**Kód:**
```typescript
// src/hooks/useUserPreferences.ts
const PREFERENCES_VERSION = '2.0.0';
const LAYOUT_VERSION = '2.0.0';

function migratePreferences(prefs, storedVersion, storedLayoutVersion) {
  // Migrácia pri zmene verzie
  if (storedLayoutVersion !== LAYOUT_VERSION) {
    // Reset layout preferencií
    return { ...prefs, /* reset layout */ };
  }
  return prefs;
}
```

### 2. **Service Worker Cache Versioning**

**Implementované:**
- `CACHE_VERSION = '2.0.0'` - Verzia Service Worker cache
- Automatické vymazanie starých cache pri aktívacii
- Force claim clients pre okamžité použitie nového SW

**Kód:**
```javascript
// public/sw.js
const CACHE_VERSION = "2.0.0";
const CACHE_NAME = `premarketprice-v${CACHE_VERSION}`;

// Automatické vymazanie starých cache
self.addEventListener("activate", (event) => {
  caches.keys().then(cacheNames => {
    cacheNames.forEach(cacheName => {
      if (cacheName.startsWith("premarketprice-") && 
          !cacheName.includes(CACHE_VERSION)) {
        caches.delete(cacheName);
      }
    });
  });
});
```

### 3. **Cache Clearing Utility**

**Implementované:**
- `clearAllCaches()` - Vyčistí všetky cache
- `forceLayoutUpdate()` - Vynúti aktualizáciu layoutu
- Automatické vymazanie pri zmene layout verzie

## 🚀 Ako to funguje

### Pri prvom načítaní (inkognito):
1. ✅ Žiadne localStorage → Použijú sa default preferencie
2. ✅ Žiadny Service Worker cache → Načítajú sa nové súbory
3. ✅ Layout verzia sa inicializuje na `2.0.0`
4. ✅ **Výsledok:** Navigácia vpravo (sidebar) ✅

### Pri načítaní s cache (normálny režim):
1. ✅ Načítajú sa preferencie z localStorage
2. ✅ Skontroluje sa layout verzia
3. ✅ Ak verzia ≠ `2.0.0` → Migrácia + reset layout preferencií
4. ✅ Service Worker vymaže staré cache
5. ✅ **Výsledok:** Navigácia vpravo (sidebar) ✅

## 📝 Ako použiť

### Pre používateľov:
1. **Automaticky:** Pri prvom načítaní po update sa layout automaticky aktualizuje
2. **Manuálne:** Použiť "Clear Cache" tlačidlo v development režime

### Pre vývojárov:
```typescript
// Pri zmene layoutu, zvýš LAYOUT_VERSION:
const LAYOUT_VERSION = '2.1.0'; // Nová verzia

// Automaticky sa:
// 1. Vymažú staré layout preferencie
// 2. Vymažú staré Service Worker cache
// 3. Načítajú sa nové súbory
```

## 🔍 Verifikácia

**Test:**
1. Otvor aplikáciu v normálnom režime
2. Skontroluj, či je navigácia vpravo (sidebar)
3. Otvor v inkognito režime
4. Skontroluj, či je navigácia vpravo (sidebar)
5. **Očakávaný výsledok:** Rovnaké zobrazenie v oboch režimoch ✅

## 📊 Verzie

- **PREFERENCES_VERSION:** `2.0.0` - Zvýšiť pri zmene štruktúry preferencií
- **LAYOUT_VERSION:** `2.0.0` - Zvýšiť pri zmene layoutu (sidebar position, header, atď.)
- **CACHE_VERSION:** `2.0.0` - Zvýšiť pri zmene Service Worker cache stratégie

## ⚠️ Dôležité

1. **Vždy zvýš LAYOUT_VERSION pri zmene layoutu**
2. **Vždy zvýš CACHE_VERSION pri zmene Service Worker**
3. **Testuj v oboch režimoch** (inkognito + normálny)
4. **Použi "Clear Cache" v development** pre testovanie

