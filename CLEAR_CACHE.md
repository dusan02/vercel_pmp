# 🧹 Cache Clearing Guide

Tento dokument popisuje, ako vyčistiť všetky cache v aplikácii, aby sa zobrazenie zhodovalo s inkognito režimom.

## 📋 Typy cache v aplikácii

1. **Service Worker Cache** - Statické súbory, API odpovede
2. **localStorage** - Preferences, Portfolio, Favorites
3. **sessionStorage** - Dočasné dáta
4. **Browser Cache** - HTTP cache pre assets

## 🚀 Spôsoby vyčistenia cache

### 1. Automatické vyčistenie (vývojový režim)

V **development režime** sa v headeri zobrazuje tlačidlo "Clear Cache" vpravo hore.

**Použitie:**
- Klikni na "Clear Cache" v headeri
- Automaticky sa vyčistia všetky cache a stránka sa reloadne

### 2. Programatické vyčistenie

```typescript
import { clearAllCachesAndReload } from '@/lib/utils/cacheClear';

// Vyčistiť všetko a reloadnúť
await clearAllCachesAndReload({
  keepLocalStorageKeys: [], // Prázdne = vymazať všetko
  unregisterSW: true, // Odregistrovať Service Worker
});
```

### 3. Manuálne vyčistenie cez konzolu

Otvori **Developer Tools** (F12) a v konzole spusti:

```javascript
// Import utility (ak je dostupná)
(async () => {
  // 1. Vyčistiť Service Worker cache
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('✓ Service Worker caches cleared');
  }

  // 2. Odregistrovať Service Worker
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.unregister();
      console.log('✓ Service Worker unregistered');
    }
  }

  // 3. Vyčistiť localStorage
  localStorage.clear();
  console.log('✓ localStorage cleared');

  // 4. Vyčistiť sessionStorage
  sessionStorage.clear();
  console.log('✓ sessionStorage cleared');

  // 5. Hard reload
  window.location.reload();
})();
```

### 4. Vyčistenie cez Browser DevTools

#### Chrome/Edge:
1. Otvor **Developer Tools** (F12)
2. Klikni pravým tlačidlom na tlačidlo **Reload** (🔄)
3. Vyber **"Empty Cache and Hard Reload"**

#### Firefox:
1. Otvor **Developer Tools** (F12)
2. Klikni pravým tlačidlom na tlačidlo **Reload**
3. Vyber **"Empty Cache and Hard Reload"**

#### Safari:
1. Otvor **Developer Tools** (Cmd+Option+I)
2. V menu **Develop** → **Empty Caches**
3. Potom **Reload** (Cmd+R)

### 5. Vyčistenie Service Worker cache

```javascript
// V konzole
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => {
    registration.unregister();
    console.log('Service Worker unregistered');
  });
});

// Vyčistiť všetky cache
caches.keys().then(cacheNames => {
  cacheNames.forEach(cacheName => {
    caches.delete(cacheName);
    console.log(`Cache ${cacheName} deleted`);
  });
});
```

## 🔧 Čo sa vyčistí

### ✅ Service Worker Cache
- `premarketprice-static-v1.0.0` - Statické súbory
- `premarketprice-dynamic-v1.0.0` - Dynamické súbory
- `premarketprice-api-v1.0.0` - API odpovede

### ✅ localStorage
- `userPreferences` - Užívateľské preferencie
- `portfolio` - Portfolio dáta
- `favorites` - Obľúbené akcie
- `heatmapCache` - Heatmap cache
- Všetky ostatné localStorage kľúče

### ✅ sessionStorage
- Všetky sessionStorage dáta

### ✅ Browser Cache
- HTTP cache pre assets (pri hard reload)

## ⚠️ Dôležité poznámky

1. **Vyčistenie cache vymaže:**
   - Užívateľské preferencie
   - Portfolio
   - Obľúbené akcie
   - Všetky cacheované dáta

2. **Po vyčistení:**
   - Stránka sa automaticky reloadne
   - Service Worker sa odregistruje
   - Všetky dáta sa načítajú znova zo servera

3. **Pre zachovanie niektorých dát:**
   ```typescript
   await clearAllCachesAndReload({
     keepLocalStorageKeys: ['userPreferences'], // Zachovať preferencie
     unregisterSW: true,
   });
   ```

## 🐛 Riešenie problémov

### Cache sa nevyčistí
1. Skontroluj, či máš oprávnenia v browseri
2. Skús vyčistiť cache manuálne cez DevTools
3. Skús reštartovať browser

### Service Worker sa neodregistruje
1. Skontroluj konzolu pre chyby
2. Manuálne odregistruj cez DevTools → Application → Service Workers
3. Skús hard reload (Ctrl+Shift+R / Cmd+Shift+R)

### localStorage sa nevyčistí
1. Skontroluj, či nie je localStorage blokovaný
2. Skús manuálne: `localStorage.clear()` v konzole
3. Skontroluj, či nie sú nejaké rozšírenia, ktoré blokujú localStorage

## 📝 API Reference

### `clearAllCaches(options?)`

Vyčistí všetky cache bez reloadu.

**Parameters:**
- `keepLocalStorageKeys?: string[]` - Kľúče, ktoré sa majú zachovať
- `unregisterSW?: boolean` - Odregistrovať Service Worker

**Returns:** `Promise<CacheClearResult>`

### `clearAllCachesAndReload(options?)`

Vyčistí všetky cache a reloadne stránku.

**Parameters:**
- `keepLocalStorageKeys?: string[]` - Kľúče, ktoré sa majú zachovať
- `unregisterSW?: boolean` - Odregistrovať Service Worker

**Returns:** `Promise<void>`

### `hardReload()`

Vykoná hard reload stránky (bypassuje cache).

**Returns:** `void`

