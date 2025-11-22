# 🚀 SYSTEMATICKÝ AUDIT PROMPT PRE CURSOR

**Tento dokument je pripravený na priame použitie v Cursor. Skopíruj celý obsah a vlož do Cursor s inštrukciou: "Urob systematický audit podľa tohto promptu."**

---

## 🧠 SYSTEM INSTRUCTION PRE CURSOR – ZAČNI TÝMTO

Chcem, aby si vykonal **hlboký, systematický audit celej aplikácie** (Next.js API, Redis, Prisma, DB, cron jobs, worker, Polygon API dataflow).

🔍 **Vystupuj ako senior backend/infrastructure engineer** so skúsenosťami s:
- High-frequency market data pipelines
- Low-latency caching strategies
- Distributed systems architecture
- Stock market data ingestion
- Real-time data synchronization

### Tvoj cieľ je:

* ✅ Nájsť všetky skryté problémy, logické chyby, edge-cases a výkonové slabiny
* ✅ Navrhnúť konkrétne riešenia pre každý problém
* ✅ Potvrdiť že dataflow funguje konzistentne v rôznych scenároch
* ✅ Upozorniť na problémy, ktoré ešte len vzniknú pri škálovaní
* ✅ Identifikovať race conditions, data inconsistencies, a silent failures

### Pre **každú otázku** urob tieto 4 kroky:

1. **🔍 Nájdi relevantné miesta v kóde**
   - Route handlers (`/api/*/route.ts`)
   - Utility funkcie (`/lib/*.ts`)
   - Workers (`/workers/*.ts`)
   - Cron jobs (`/api/cron/*/route.ts`)
   - Prisma schema a queries
   - Redis caching logiku
   - Frontend komponenty, ktoré volajú API

2. **📊 Popíš presný aktuálny stav**
   - Nie domnienky, ale to, čo **reálne robí kód**
   - Použi konkrétne funkcie, názvy súborov, volania, logiku
   - Ukáž code snippets, ak je to relevantné
   - Identifikuj dataflow: odkiaľ → kam → ako

3. **⚠️ Identifikuj problémy**
   - Performance bottlenecks (N+1 queries, neoptimalizované batch calls)
   - Logické chyby (off-by-one errors, timezone issues, edge cases)
   - Dataflow problémy (race conditions, stale data, inconsistent state)
   - Chýbajúce edge-case handlovanie (weekends, holidays, missing data)
   - Silent failures (chyby, ktoré sa len logujú, ale neovplyvnia output)

4. **💡 Navrhni konkrétne riešenia**
   - Konkrétne code changes, nie len "malo by sa..."
   - TODO list s prioritami
   - Odhadnutý impact (critical / high / medium / low)

### Formátuj odpovede takto:

```markdown
### Otázka X: [Názov otázky]

**Relevantné súbory:**
- `src/app/api/xxx/route.ts` (riadky X-Y)
- `src/lib/xxx.ts` (funkcia `yyy`)
- `prisma/schema.prisma` (model `Zzz`)

**Analýza aktuálneho stavu:**
[Presný popis toho, čo kód reálne robí, s code snippets]

**Identifikované problémy:**
1. [Problém 1] - [Dôvod, prečo je to problém]
2. [Problém 2] - [Dôvod, prečo je to problém]

**Návrhy riešení:**
1. [Riešenie 1] - [Ako to implementovať]
2. [Riešenie 2] - [Ako to implementovať]

**TODO list:**
- [ ] [Akcia 1] - Priority: Critical/High/Medium/Low
- [ ] [Akcia 2] - Priority: Critical/High/Medium/Low
```

---

## 🔍 AUDIT OTÁZKY

### 1️⃣ Data model & konzistencia

#### Otázka 1: Jednoznačnosť dát v Ticker + DailyRef + SessionPrice

**Je `Ticker` + `DailyRef` + `SessionPrice` navrhnuté tak, že z nich *jednoznačne* vieme:**
- posledný previous close,
- dnešnú regular close,
- aktuálnu pre-market / regular / after-hours cenu
pre *každý* ticker?

Prosím, prekontroluj, že v schéme nie je logická diera.

---

#### Otázka 2: Interpretácia DailyRef.date

**Ako presne interpretujeme `DailyRef.date`?**

Znamená:
- deň, kedy sa fetchol previous close,
- alebo deň, ku ktorému previous close patrí (t. j. deň obchodnej seansy)?

Prosím, over, že je to konzistentné v celej aplikácii (cron, výpočty, heatmapa).

---

#### Otázka 3: Implicitný predpoklad DailyRef.date = today

**Je niekde v kóde implicitný predpoklad, že `DailyRef.date = today`?**

Skontroluj mi, či neexistujú miesta, ktoré by sa pri víkendoch / sviatkoch správali zle, lebo očakávajú „včerajší close = `today - 1`".

---

#### Otázka 4: Konzistencia denormalizovaných dát

**Je `Ticker.latestPrevClose` alebo podobný denormalizovaný údaj (ak existuje) vždy v súlade s `DailyRef`?**

Over, že pri update `DailyRef` sa prípadný cache / denormalizovaná hodnota v `Ticker` aktualizuje všade.

---

#### Otázka 5: SessionPrice bez DailyRef

**Existujú situácie, kedy vieme mať v DB `SessionPrice`, ale nemáme žiadny relevantný `DailyRef`?**

Ak áno, čo vtedy robí `/api/heatmap` a `/api/stocks`?

---

### 2️⃣ Pipeline pre ceny (Polygon → DB → API)

#### Otázka 6: Jediný master pre aktuálne ceny

**Kto je *jediný* „master" pre aktuálne ceny?**

Prosím, over, či všetky API endpointy (`/api/stocks`, `/api/heatmap`, atď.) berú aktuálne ceny buď:
- *vždy* z `SessionPrice`/Redis, alebo
- *vždy* priamo z Polygonu.

Zisti, či náhodou nemáme mix (niekde priamo Polygon, inde DB).

---

#### Otázka 7: Priame volania Polygon API v /api/stocks

**Volá `/api/stocks` ešte niekde napriamo Polygon snapshot (per ticker)?**

Prejdi kód a potvrď, či sú *všetky* priame volania Polygonu pre ceny centralizované v workeri / crone.

---

#### Otázka 8: Škálovateľnosť workeru

**Je worker, ktorý ťahá Polygon snapshoty, navrhnutý tak, že škáluje pri 500–1000 tickeroch?**

Skontroluj:
- ako často sa volá Polygon (sekundy / minúty),
- aký je počet volaní za minútu,
- či rešpektujeme rate limit.

---

#### Otázka 9: Multi-ticker endpoint

**Existuje multi-ticker endpoint na Polygon (snapshot všetkých tickrov), a používame ho?**

Ak nie, skús navrhnúť, kde by sa oplatilo prejsť na batch endpoint namiesto per-ticker požiadaviek.

---

#### Otázka 10: Worker failure handling

**Ako sa rieši situácia, keď worker dočasne padne?**

Over:
- čo sa stane s `/api/heatmap` a `/api/stocks`, keď chýbajú čerstvé `SessionPrice`,
- ako staré data ešte považujeme za „ok" (max TTL).

---

### 3️⃣ Previous close, percent change & fallback logika

#### Otázka 11: Výpočet percentuálnej zmeny

**Ako presne počítame percentuálnu zmenu?**

Prosím nájdi všetky miesta, kde sa ráta `% change` a popíš vzorec + zdroj:
- aktuálna cena – odkiaľ,
- previous close – odkiaľ,
- pre pre-market / regular / after-hours.

---

#### Otázka 12: Fallback previousClose = currentPrice

**Je v kóde niekde fallback typu `previousClose = currentPrice`?**

- Ak áno, ukáž konkrétne miesto a vysvetli, čo to spraví s heatmapou (0 % všade).
- Navrhni lepšiu fallback logiku (napr. nezobraziť ticker, alebo zobraziť bez farby).

---

#### Otázka 13: Percent change počas víkendov / sviatkov

**Ako sa správa výpočet percent change počas víkendov / sviatkov?**

Over:
- ktorý `DailyRef` sa berie ako previous close, keď je sobota/nedeľa,
- či existuje test, ktorý to verifikuje.

---

#### Otázka 14: Session type rozlišovanie

**Rozlišujeme v dátach session typu `PRE`, `REG`, `POST`?**

Ak áno:
- ako z toho API vyberajú, čo ukázať (napr. pre-market vs regulárny trh),
- ak nie, navrhni, či by nebolo vhodné pridať `sessionType`.

---

### 4️⃣ Crons & časovanie vs. US market

#### Otázka 15: Časovanie cronov

**Kedy konkrétne beží cron na update `previousClose` a `sharesOutstanding`?**

- V akom čase (UTC/CET)?
- Je to pred open, po close, alebo „nejak náhodne"?

---

#### Otázka 16: Timezone handling v cronoch

**Počíta cron s timezónou US trhu (NYSE/Nasdaq)?**

Over, či sa dátumy „dní" nepočítajú len v CET/UTC, a či to pri prepočtoch nespôsobuje off-by-one day problémy.

---

#### Otázka 17: Oddelenie regularClose a previousClose jobov

**Je job na aktualizáciu `regularClose` (dnešná close cena) oddelený od jobu na `previousClose`?**

Ak nie:
- skús navrhnúť, ako ich oddeliť:
  - cron po close (nastaví `regularClose`),
  - cron pred open ďalší deň (nastaví `previousClose`).

---

#### Otázka 18: Cron failure handling

**Čo sa stane, ak jeden z cronov zlyhá (timeout, chyba API)?**

- Logovanie?
- Alert?
- Máme retry mechanizmus / ochranu proti tomu, že budeme mať prázdny `DailyRef` pre daný deň?

---

### 5️⃣ API endpointy – dataflow & edge cases

#### Otázka 19: Dataflow diagram pre endpointy

**Pre každý endpoint (`/api/stocks`, `/api/heatmap`, `/api/prices` atď.) sprav diagram:**

- odkiaľ berie:
  - statické dáta,
  - previous close,
  - aktuálnu cenu,
  - market cap,
  - market cap diff,
- a over, že nikde nie je nepotrebný query / API call.

---

#### Otázka 20: Rozdiely v výpočtoch medzi endpointmi

**Existujú rozdiely v tom, ako `/api/stocks` a `/api/heatmap` počítajú market cap a percent change?**

Ak áno:
- popíš rozdiely,
- navrhni jednotnú funkciu / shared modul.

---

#### Otázka 21: Handling chýbajúcich dát

**Čo robí každý endpoint, keď chýbajú:**
- `Ticker` dáta,
- `DailyRef` dáta,
- `SessionPrice` dáta?

Prosím, skús nájsť všetky miesta, kde sa tento stav rieši (fallbacky, defaulty).

---

#### Otázka 22: Silent failures

**Je niekde silent fail pri chýbajúcich dátach (len `console.warn` + 0 hodnoty)?**

Ak áno, navrhni konzistentnú politiku:
- logovanie + označenie tickera ako „invalid/incomplete",
- alebo úplné vynechanie z respondu.

---

### 6️⃣ Cache (Redis, ETag, TTL) a výkon

#### Otázka 23: ETag generovanie

**Je ETag generovaný vždy správne pri zmene dát v DB/Redis?**

Over:
- čo sa stane, keď update-uješ `SessionPrice` / `DailyRef` – vie o tom endpoint pri generovaní ETagu?
- nehrozí, že klient dostane 304, hoci sa ceny zmenili?

---

#### Otázka 24: Batch Redis mGet

**Je batch `mGet` na Redis využitý všade, kde ťaháme viac tickerov naraz?**

Skontroluj, či:
- niekde používame `get` v cykle namiesto `mGet`,
- či by sme vedeli počet Redis volaní ešte znížiť.

---

#### Otázka 25: TTL nastavenia

**Sú TTL nastavené rozumne vzhľadom na účel stránky?**

- `/api/heatmap` – TTL 10 s vs. real-time pocit,
- `/api/stocks` – TTL 120 s.

Navrhni, či by pre pre-market/otvorený trh nebolo vhodné iné TTL.

---

#### Otázka 26: Response time analýza

**Aký je reálny response time pri:**
- 10 tickeroch,
- 100 tickeroch,
- 600+ tickeroch?

Over, či niekde nie je skrytý N+1 DB query / JSON transform performance problém.

---

### 7️⃣ Robustnosť, chyby, monitoring

#### Otázka 27: Polygon API error handling

**Kde všade sa chyby z Polygon API len logujú a kde reálne ovplyvnia output (napr. null, 0, vynechaný ticker)?**

Skús spraviť mapu:
- „Polygon fail → ako vyzerá odpoveď endpointu?"

---

#### Otázka 28: Centralizované error handling

**Existuje centrálne miesto na mapovanie Polygon chýb (rate limit, 5xx, network error)?**

Ak nie:
- navrhni `handlePolygonError` utilitu + jednotnú stratégiu:
  - retry x krát,
  - fallback na staršie dáta,
  - alebo označenie tickera ako „dočasne bez dát".

---

#### Otázka 29: Monitoring & alerting

**Má aplikácia monitoring / alerting pre situácie, keď:**
- worker nebeží,
- cron sa nespustí / zlyhá,
- Redis nie je dostupný,
- db query trvajú pridlho?

Ak nie, navrhni, kde pridať aspoň základne logy / healthcheck endpoint.

---

### 8️⃣ Rozšíriteľnosť do budúcna

#### Otázka 30: Multi-market & asset type support

**Je návrh dát (Ticker/DailyRef/SessionPrice) pripravený na:**
- viac trhov (US + EU),
- viac typov assetov (ETF, indexy, crypto)?

Ak nie, čo by sa muselo zmeniť (napr. `exchange`, `assetType`)?

---

#### Otázka 31: Business logika modularita

**Je teraz jednoduché pridať ďalší „view" nad dátami (napr. earnings heatmap, top movers tab)?**

Over, či business logika (výpočet % change, market cap diff) je v samostatných helperoch, nie roztrúsená po endpointoch.

---

### 9️⃣ Extra Audit Sekcia – "tricky" otázky

#### Otázka 32: Timezone konzistencia

**Sú všetky dáta timestampované v rovnakom časovom pásme (UTC)?**

Ak nie, kde hrozí posun o +1/-1 deň?

---

#### Otázka 33: Duplicitné timestamps v queries

**Používame niekde „prvý záznam s order by desc", ktorý sa môže správať nesprávne pri duplicitných timestampoch?**

---

#### Otázka 34: Null snapshot handling

**Existuje ochrana pred tým, že Polygon snapshot vráti `null` pre symboly s nízkym volume?**

---

#### Otázka 35: Pre-market only symbols

**Ako riešime symboly, ktoré majú snapshot len počas pre-market, ale nie počas open?**

---

#### Otázka 36: Stale snapshot detection

**Ako sa správa systém, keď Polygon vráti starý snapshot (delay 5–30 sekúnd)?**

---

#### Otázka 37: Race conditions

**Je niekde race condition medzi:**
- cron na previous close
- worker na session prices
- heatmap fetch

---

#### Otázka 38: SessionPrice deduplikácia

**Je potreba deduplikovať záznamy v `SessionPrice`?**

Existuje možnosť, že sa uloží ten istý timestamp dvakrát?

---

#### Otázka 39: Redis expiration handling

**Čo sa stane, keď Redis vyprší skôr, než príde ďalší update workerom?**

---

#### Otázka 40: SharesOutstanding = 0 handling

**Je niekde v kóde implicitný predpoklad, že `sharesOutstanding > 0`?**

(ETFky, fondy a niektoré ADR môžu vrátiť 0.)

---

#### Otázka 41: Škálovateľnosť na 1000-2000 tickrov

**Je aplikácia pripravená na 1000–2000 tickrov bez spomalenia?**

Identifikuj „bottlenecks", ktoré sa prejavia až neskôr.

---

## 🎯 FINÁLNA INŠTRUKCIA PRE CURSOR

**Keď skončíš s auditom všetkých 41 otázok, vytvor pre mňa:**

### 📋 MASTER TODO LIST

Zoradený podľa:
1. **Priority** (Critical → High → Medium → Low)
2. **Náročnosť** (Quick Fix → Medium → Hard)
3. **Impact** (Data Loss Risk → Performance → Code Quality)

Formát:
```markdown
## MASTER TODO LIST

### 🔴 CRITICAL (Data Loss / Incorrect Data Risk)
- [ ] [Názov úlohy] - [Súbor] - [Odhadovaný čas] - [Impact]
  - Dôvod: [Prečo je to critical]
  - Riešenie: [Stručný popis]

### 🟠 HIGH (Performance / User Experience)
- [ ] [Názov úlohy] - [Súbor] - [Odhadovaný čas] - [Impact]

### 🟡 MEDIUM (Code Quality / Maintainability)
- [ ] [Názov úlohy] - [Súbor] - [Odhadovaný čas] - [Impact]

### 🟢 LOW (Nice to have / Future improvements)
- [ ] [Názov úlohy] - [Súbor] - [Odhadovaný čas] - [Impact]
```

---

## ✅ HOTOVO

Tento prompt je pripravený na použitie. Skopíruj celý obsah a vlož do Cursor s inštrukciou:

**"Urob systematický audit podľa tohto promptu. Pre každú otázku (1-41) urob 4 kroky: nájdi relevantné miesta, popíš aktuálny stav, identifikuj problémy, navrhni riešenia. Na konci vytvor MASTER TODO LIST zoradený podľa priority a náročnosti."**

---

**Poznámka:** Tento audit je navrhnutý tak, aby odhalil všetky slabé miesta v dataflow, logike aj výkone. Očakáva sa, že niektoré otázky môžu odhaliť problémy, ktoré treba riešiť postupne.

