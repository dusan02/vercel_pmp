# Analýza Webpack Error: `Cannot read properties of undefined (reading 'call')`

## 📋 Executive Summary

**Chyba:** `TypeError: Cannot read properties of undefined (reading 'call')`  
**Lokalizácia:** `useWebSocket.ts:7:74` → `useStockData.ts:7:77` → `HomePage.tsx:14:77`  
**Status:** 🔴 **AKTÍVNA** - Vyžaduje opravu

---

## 🔍 Analýza Problému

### 1. Stack Trace Analýza

```
useWebSocket.ts:7:74
  ↓ (imported by)
useStockData.ts:7:77
  ↓ (imported by)
HomePage.tsx:14:77
```

**Pozorovanie:**
- Chyba sa vyskytuje v `options.factory` vo Webpack runtime
- Webpack sa snaží načítať modul `useWebSocket.ts`, ale factory funkcia je `undefined`
- Riadok 7 v `useWebSocket.ts` je prázdny riadok medzi komentárom a exportom

### 2. Aktuálny Stav Kódu

**`useWebSocket.ts`:**
```typescript
'use client';

/**
 * WebSocket hook stub
 * ...
 */

export function useWebSocket(_options: any = {}) {
  // ...
}
```

**Problém:**
- Riadok 7 je prázdny riadok
- Webpack cache môže mať starú verziu, kde riadok 7 bol niečo iné
- Turbopack môže mať problém s module resolution

**`useStockData.ts`:**
```typescript
// WebSocket functionality - temporarily disabled
// TODO: Re-enable WebSocket after fixing webpack import issue
/*
useWebSocket({
  ...
});
*/
```

**Pozorovanie:**
- Import `useWebSocket` je zakomentovaný
- Ale Webpack sa stále snaží načítať modul (možno kvôli cache)

### 3. Konfigurácia

**`next.config.ts`:**
- Turbopack je aktivovaný (`--turbopack` v package.json)
- Webpack config má externals pre `socket.io-client` na serveri
- Nie sú žiadne špeciálne pravidlá pre `useWebSocket.ts`

**`package.json`:**
```json
"dev:next": "next dev --turbopack -H 127.0.0.1 -p 3000"
```

---

## 🔬 Root Cause Analysis

### Možné Príčiny

1. **Poškodená Webpack/Turbopack Cache** ⭐ (Najpravdepodobnejšie)
   - `.next` cache obsahuje starú verziu modulu
   - Factory funkcia nie je správne definovaná v cache
   - **Riešenie:** Vymazať `.next` cache

2. **Turbopack Module Resolution Issue**
   - Turbopack môže mať problém s module resolution pre stub súbory
   - Možno problém s `'use client'` direktívou
   - **Riešenie:** Skúsiť bez Turbopack (klasický Webpack)

3. **Export/Import Mismatch**
   - Modul sa snaží načítať, ale export nie je správne definovaný
   - Možno problém s prázdnymi riadkami pred exportom
   - **Riešenie:** Presunúť export na začiatok súboru

4. **Webpack Factory Function Issue**
   - Webpack runtime sa snaží volať factory funkciu, ale je undefined
   - Možno problém s module format (ESM vs CommonJS)
   - **Riešenie:** Explicitný export bez komentárov

---

## 🛠️ Navrhované Riešenia

### Riešenie 1: Minimalizovať `useWebSocket.ts` (ODPORÚČANÉ)

**Cieľ:** Urobiť súbor úplne minimálny, bez komentárov, s exportom na začiatku

**Zmeny:**
```typescript
'use client';

export function useWebSocket(_options: any = {}) {
  return {
    status: {
      isConnected: false,
      isConnecting: false,
      error: 'WebSocket temporarily disabled',
      lastUpdate: null,
      connectedClients: 0,
      isImplemented: false
    },
    connect: () => {},
    disconnect: () => {},
    ping: () => {},
    socket: null
  };
}
```

**Výhody:**
- Minimálny kód, žiadne komentáre
- Export hneď po 'use client'
- Žiadne prázdne riadky, ktoré môžu spôsobovať problémy

### Riešenie 2: Vymazať Webpack Cache

**Kroky:**
1. Zastaviť Next.js server
2. Vymazať `.next` priečinok
3. Vymazať browser cache (localStorage, sessionStorage)
4. Reštartovať server

**Príkaz:**
```bash
# Zastaviť server
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force

# Vymazať cache
Remove-Item -Recurse -Force .next

# Reštartovať
npm run dev:next
```

### Riešenie 3: Skúsiť bez Turbopack

**Zmena v `package.json`:**
```json
"dev:next": "next dev -H 127.0.0.1 -p 3000"  // Bez --turbopack
```

**Výhody:**
- Klasický Webpack je stabilnejší
- Lepšia podpora pre stub súbory
- Menej experimentálnych funkcií

### Riešenie 4: Presunúť Export na Začiatok

**Pred:**
```typescript
'use client';

/**
 * Komentáre...
 */

export function useWebSocket(...) {
```

**Po:**
```typescript
'use client';

export function useWebSocket(_options: any = {}) {
  // Implementácia
}
```

---

## 📝 Implementačný Plán

### Krok 1: Minimalizovať `useWebSocket.ts`
- ✅ Odstrániť všetky komentáre
- ✅ Presunúť export na začiatok
- ✅ Odstrániť prázdne riadky

### Krok 2: Vymazať Cache
- ✅ Zastaviť server
- ✅ Vymazať `.next`
- ✅ Vymazať browser cache

### Krok 3: Reštartovať Server
- ✅ Spustiť `npm run dev:next`
- ✅ Overiť, či chyba pretrváva

### Krok 4: Ak Problém Pretrváva
- ⚠️ Skúsiť bez Turbopack
- ⚠️ Skontrolovať, či nie je problém s importmi v `useStockData.ts`
- ⚠️ Skontrolovať, či nie je problém s `next.config.ts`

---

## 🎯 Odporúčaný Postup

1. **Najprv:** Minimalizovať `useWebSocket.ts` (Riešenie 1)
2. **Potom:** Vymazať cache (Riešenie 2)
3. **Ak pretrváva:** Skúsiť bez Turbopack (Riešenie 3)

---

## 📊 Očakávané Výsledky

- ✅ Webpack úspešne načíta modul `useWebSocket.ts`
- ✅ Factory funkcia je správne definovaná
- ✅ Aplikácia sa načíta bez chýb
- ✅ Žiadne Webpack runtime errors

---

**Dátum analýzy:** 2025-01-26  
**Priorita:** 🔴 VYSOKÁ  
**Status:** Čaká na implementáciu

