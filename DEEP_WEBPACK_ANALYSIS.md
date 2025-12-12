# Hlboká Analýza Webpack Error - Refaktoring Plán

## 🔍 Hlbšia Analýza Problému

### Aktuálny Stav

**Chyba:** `TypeError: Cannot read properties of undefined (reading 'call')`  
**Lokalizácia:** `useWebSocket.ts:7:74` → `useStockData.ts:7:77` → `HomePage.tsx:14:77`

**Pozorovania:**
1. ✅ `useWebSocket.ts` je minimálny (18 riadkov, bez komentárov)
2. ✅ Export je hneď po `'use client'`
3. ✅ `useStockData.ts` má zakomentovaný import `useWebSocket`
4. ❌ Chyba **pretrváva** aj po vymazaní cache
5. ❌ Chyba **pretrváva** aj bez Turbopack

### Možné Príčiny (Hlbšia Analýza)

#### 1. **Webpack Module Resolution Issue** ⭐ (Najpravdepodobnejšie)

**Problém:**
- Webpack sa snaží načítať modul `useWebSocket.ts` aj keď nie je importovaný
- Možno kvôli:
  - Tree-shaking mechanizmu
  - Code splitting
  - Dynamic import mechanizmu
  - Webpack cache stále obsahuje starú verziu

**Dôkaz:**
- Stack trace ukazuje: `useWebSocket.ts:7:74` → `useStockData.ts:7:77`
- `useStockData.ts:7` je `const fetchWithRetry = ...` - **NIE import useWebSocket**
- Ale Webpack sa stále snaží načítať modul

#### 2. **Webpack Factory Function Issue**

**Problém:**
- Webpack runtime sa snaží volať factory funkciu, ale je `undefined`
- Možno problém s module format (ESM vs CommonJS)
- Možno problém s `'use client'` direktívou

#### 3. **Next.js RSC (React Server Components) Issue**

**Problém:**
- Next.js 15 má RSC (React Server Components)
- Možno problém s `'use client'` direktívou v kombinácii s RSC
- Možno problém s module resolution v RSC kontexte

#### 4. **Webpack Config Issue**

**Problém:**
- `next.config.ts` má custom webpack konfiguráciu
- Možno problém s `splitChunks` alebo `cacheGroups`
- Možno problém s `externals` pre `socket.io-client`

---

## 🛠️ Refaktoring Plán

### Krok 1: Presunúť `useWebSocket.ts` do iného priečinka

**Cieľ:** Izolovať modul od Webpack module resolution

**Zmeny:**
- Presunúť `src/hooks/useWebSocket.ts` → `src/lib/stubs/useWebSocket.ts`
- Aktualizovať všetky importy (ak existujú)

### Krok 2: Vytvoriť úplne nový súbor s iným názvom

**Cieľ:** Obísť Webpack cache úplne

**Zmeny:**
- Vytvoriť `src/lib/stubs/websocketStub.ts`
- Exportovať `useWebSocket` z nového súboru
- Odstrániť starý `useWebSocket.ts`

### Krok 3: Upraviť Webpack Config

**Cieľ:** Pridať explicitné pravidlá pre stub súbory

**Zmeny:**
- Pridať `resolve.alias` pre `useWebSocket`
- Pridať `module.rules` pre stub súbory
- Možno pridať `externals` pre `useWebSocket` na kliente

### Krok 4: Skúsiť bez `'use client'` direktívy

**Cieľ:** Overiť, či problém nie je v `'use client'`

**Zmeny:**
- Odstrániť `'use client'` z `useWebSocket.ts`
- Overiť, či to pomôže

### Krok 5: Vytvoriť Conditional Export

**Cieľ:** Exportovať len ak je potrebné

**Zmeny:**
- Použiť conditional export
- Exportovať len ak modul nie je undefined

---

## 🎯 Odporúčaný Postup

1. **Najprv:** Presunúť `useWebSocket.ts` do `src/lib/stubs/`
2. **Potom:** Vytvoriť úplne nový súbor s iným názvom
3. **Ak pretrváva:** Upraviť Webpack config
4. **Ak stále pretrváva:** Skúsiť bez `'use client'`

---

**Dátum analýzy:** 2025-01-26  
**Status:** 🔴 Čaká na implementáciu

