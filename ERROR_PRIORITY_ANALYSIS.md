# Analýza Kritickosti Chýb

## 🔴 **NAJKRITICKEJŠIA CHYBA**

### 1. `TypeError: Cannot read properties of undefined (reading 'call')` v `useWebSocket.ts:7:74`

**Kritickosť:** 🔴 **KRITICKÁ** - Blokuje načítanie aplikácie

**Dôvody:**
- ✅ **Blokuje renderovanie** - Aplikácia sa nemôže načítať
- ✅ **Spôsobuje ErrorBoundary** - ErrorBoundary zachytáva chybu, aplikácia zobrazuje error state
- ✅ **Kaskádový efekt** - Všetky ostatné chyby sú len následky tejto hlavnej chyby
- ✅ **Vyskytuje sa 3x** - V uncaught promise, v ErrorBoundary, a v componentDidCatch

**Stack Trace:**
```
useWebSocket.ts:7:74
  ↓
useStockData.ts:7:77
  ↓
HomePage.tsx:14:77
  ↓
ErrorBoundary (zachytáva chybu)
```

**Dopad:**
- ❌ Aplikácia sa nemôže načítať
- ❌ Používateľ vidí error screen namiesto aplikácie
- ❌ Funkčnosť aplikácie je úplne blokovaná

**Riešenie:**
- ✅ **PRIORITA #1** - Musí byť opravená okamžite
- ✅ Vymazať Webpack cache
- ✅ Minimalizovať `useWebSocket.ts` (už hotové)
- ✅ Reštartovať server

---

## 🟡 **SEKUNDÁRNE CHYBY** (Nie kritické)

### 2. `POST http://localhost:3000/__nextjs_original-stack-frames net::ERR_CONNECTION_REFUSED`

**Kritickosť:** 🟡 **NIE KRITICKÁ** - Len development debugging

**Dôvody:**
- ⚠️ **Len pre React DevTools** - Toto je request od React DevTools pre lepšie stack traces
- ⚠️ **Neplynie z hlavnej chyby** - Je to len sekundárny problém
- ⚠️ **Neblokuje funkčnosť** - Aplikácia by fungovala aj bez tohto

**Dopad:**
- ⚠️ Horšie debugging experience
- ⚠️ React DevTools nemôže zobraziť detailné stack traces
- ✅ **Neblokuje aplikáciu**

**Riešenie:**
- ⚠️ **PRIORITA #3** - Opraviť po hlavnej chybe
- ⚠️ Možno opraviť automaticky po oprave hlavnej chyby

---

### 3. `WebSocket connection to 'ws://localhost:3000/_next/webpack-hmr' failed`

**Kritickosť:** 🟡 **NIE KRITICKÁ** - Len development experience

**Dôvody:**
- ⚠️ **Len HMR (Hot Module Replacement)** - Toto je pre automatické obnovovanie kódu po zmene
- ⚠️ **Neblokuje aplikáciu** - Aplikácia funguje aj bez HMR
- ⚠️ **Len development** - V produkcii sa nepoužíva

**Dopad:**
- ⚠️ Musíš manuálne refreshnúť stránku po zmene kódu
- ⚠️ Horšie development experience
- ✅ **Neblokuje aplikáciu**

**Riešenie:**
- ⚠️ **PRIORITA #2** - Opraviť po hlavnej chybe
- ⚠️ Možno opraviť automaticky po oprave hlavnej chyby

---

## 📊 **Poradie Priorít**

| Priorita | Chyba | Kritickosť | Blokuje Aplikáciu? |
|----------|-------|------------|-------------------|
| **#1** | `Cannot read properties of undefined (reading 'call')` | 🔴 KRITICKÁ | ✅ ÁNO |
| **#2** | `WebSocket HMR failed` | 🟡 NIE KRITICKÁ | ❌ NIE |
| **#3** | `__nextjs_original-stack-frames ERR_CONNECTION_REFUSED` | 🟡 NIE KRITICKÁ | ❌ NIE |

---

## 🎯 **Záver**

**Najkritickejšia chyba je #1** - `Cannot read properties of undefined (reading 'call')` v `useWebSocket.ts:7:74`

**Prečo:**
1. ✅ **Blokuje načítanie aplikácie** - Aplikácia sa nemôže renderovať
2. ✅ **Spôsobuje všetky ostatné chyby** - ErrorBoundary, componentDidCatch, atď.
3. ✅ **Používateľ vidí error screen** - Aplikácia nie je použiteľná
4. ✅ **Musí byť opravená okamžite** - Bez tejto opravy aplikácia nefunguje

**Ostatné chyby:**
- 🟡 Sú len "noise" - development warnings
- 🟡 Možno sa opravia automaticky po oprave hlavnej chyby
- 🟡 Neblokujú funkčnosť aplikácie

---

**Odporúčanie:** 
1. **OKAMŽITE** opraviť chybu #1
2. Potom skontrolovať, či sa ostatné chyby opravili automaticky
3. Ak nie, opraviť ich v poradí priority (#2, #3)

