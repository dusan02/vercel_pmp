# 🧹 Rýchle vyčistenie cache

## Najrýchlejší spôsob (Hard Refresh)
**Windows/Linux:** `Ctrl + Shift + R` alebo `Ctrl + F5`  
**Mac:** `Cmd + Shift + R`

## Kompletné vyčistenie cez konzolu

Otvori **Developer Tools** (F12) → **Console** a vložiť:

```javascript
(async () => {
  console.log('🧹 Čistenie cache...');
  
  // 1. Service Worker cache
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('✓ Service Worker caches vymazané');
  }
  
  // 2. Odregistrovať Service Worker
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
    console.log('✓ Service Worker odregistrovaný');
  }
  
  // 3. localStorage
  localStorage.clear();
  console.log('✓ localStorage vymazaný');
  
  // 4. sessionStorage
  sessionStorage.clear();
  console.log('✓ sessionStorage vymazaný');
  
  // 5. IndexedDB (ak existuje)
  if ('indexedDB' in window) {
    indexedDB.databases().then(databases => {
      databases.forEach(db => {
        indexedDB.deleteDatabase(db.name);
      });
    });
    console.log('✓ IndexedDB vymazaný');
  }
  
  console.log('✅ Všetko vyčistené! Reloadujem stránku...');
  
  // 6. Hard reload
  setTimeout(() => {
    window.location.reload(true);
  }, 500);
})();
```

## Alternatíva: Použiť utility funkciu

Ak máš prístup k utility funkcii:

```javascript
// V konzole
import('/lib/utils/cacheClear').then(module => {
  module.clearAllCachesAndReload({
    keepLocalStorageKeys: [],
    unregisterSW: true
  });
});
```

## Incognito/Private režim

Najjednoduchší spôsob - otvor stránku v **Incognito/Private** okne:
- **Chrome/Edge:** `Ctrl + Shift + N`
- **Firefox:** `Ctrl + Shift + P`
- **Safari:** `Cmd + Shift + N`

## Čo sa vyčistí

✅ Service Worker cache  
✅ localStorage (preferencie, portfolio, favorites)  
✅ sessionStorage  
✅ IndexedDB  
✅ Browser HTTP cache (pri hard reload)

