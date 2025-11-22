# 🔍 Systematický Audit Prompt pre Cursor

Tento dokument obsahuje kompletný audit prompt, ktorý môžeš použiť v Cursor na systematickú kontrolu dataflow, logiky a výkonu aplikácie.

---

## 📋 Audit Otázky

### 1️⃣ Data model & konzistencia

1. **Je `Ticker` + `DailyRef` + `SessionPrice` navrhnuté tak, že z nich *jednoznačne* vieme:**
   - posledný previous close,
   - dnešnú regular close,
   - aktuálnu pre-market / regular / after-hours cenu
   pre *každý* ticker? Prosím, prekontroluj, že v schéme nie je logická diera.

2. **Ako presne interpretujeme `DailyRef.date`?**
   Znamená:
   - deň, kedy sa fetchol previous close,
   - alebo deň, ku ktorému previous close patrí (t. j. deň obchodnej seansy)?
   Prosím, over, že je to konzistentné v celej aplikácii (cron, výpočty, heatmapa).

3. **Je niekde v kóde implicitný predpoklad, že `DailyRef.date = today`?**
   Skontroluj mi, či neexistujú miesta, ktoré by sa pri víkendoch / sviatkoch správali zle, lebo očakávajú „včerajší close = `today - 1`".

4. **Je `Ticker.latestPrevClose` alebo podobný denormalizovaný údaj (ak existuje) vždy v súlade s `DailyRef`?**
   Over, že pri update `DailyRef` sa prípadný cache / denormalizovaná hodnota v `Ticker` aktualizuje všade.

5. **Existujú situácie, kedy vieme mať v DB `SessionPrice`, ale nemáme žiadny relevantný `DailyRef`?**
   Ak áno, čo vtedy robí `/api/heatmap` a `/api/stocks`?

---

### 2️⃣ Pipeline pre ceny (Polygon → DB → API)

6. **Kto je *jediný* „master" pre aktuálne ceny?**
   Prosím, over, či všetky API endpointy (`/api/stocks`, `/api/heatmap`, atď.) berú aktuálne ceny buď:
   - *vždy* z `SessionPrice`/Redis, alebo
   - *vždy* priamo z Polygonu.
   Zisti, či náhodou nemáme mix (niekde priamo Polygon, inde DB).

7. **Volá `/api/stocks` ešte niekde napriamo Polygon snapshot (per ticker)?**
   Prejdi kód a potvrď, či sú *všetky* priame volania Polygonu pre ceny centralizované v workeri / crone.

8. **Je worker, ktorý ťahá Polygon snapshoty, navrhnutý tak, že škáluje pri 500–1000 tickeroch?**
   Skontroluj:
   - ako často sa volá Polygon (sekundy / minúty),
   - aký je počet volaní za minútu,
   - či rešpektujeme rate limit.

9. **Existuje multi-ticker endpoint na Polygon (snapshot všetkých tickrov), a používame ho?**
   Ak nie, skús navrhnúť, kde by sa oplatilo prejsť na batch endpoint namiesto per-ticker požiadaviek.

10. **Ako sa rieši situácia, keď worker dočasne padne?**
    Over:
    - čo sa stane s `/api/heatmap` a `/api/stocks`, keď chýbajú čerstvé `SessionPrice`,
    - ako staré data ešte považujeme za „ok" (max TTL).

---

### 3️⃣ Previous close, percent change & fallback logika

11. **Ako presne počítame percentuálnu zmenu?**
    Prosím nájdi všetky miesta, kde sa ráta `% change` a popíš vzorec + zdroj:
    - aktuálna cena – odkiaľ,
    - previous close – odkiaľ,
    - pre pre-market / regular / after-hours.

12. **Je v kóde niekde fallback typu `previousClose = currentPrice`?**
    - Ak áno, ukáž konkrétne miesto a vysvetli, čo to spraví s heatmapou (0 % všade).
    - Navrhni lepšiu fallback logiku (napr. nezobraziť ticker, alebo zobraziť bez farby).

13. **Ako sa správa výpočet percent change počas víkendov / sviatkov?**
    Over:
    - ktorý `DailyRef` sa berie ako previous close, keď je sobota/nedeľa,
    - či existuje test, ktorý to verifikuje.

14. **Rozlišujeme v dátach session typu `PRE`, `REG`, `POST`?**
    Ak áno:
    - ako z toho API vyberajú, čo ukázať (napr. pre-market vs regulárny trh),
    - ak nie, navrhni, či by nebolo vhodné pridať `sessionType`.

---

### 4️⃣ Crons & časovanie vs. US market

15. **Kedy konkrétne beží cron na update `previousClose` a `sharesOutstanding`?**
    - V akom čase (UTC/CET)?
    - Je to pred open, po close, alebo „nejak náhodne"?

16. **Počíta cron s timezónou US trhu (NYSE/Nasdaq)?**
    Over, či sa dátumy „dní" nepočítajú len v CET/UTC, a či to pri prepočtoch nespôsobuje off-by-one day problémy.

17. **Je job na aktualizáciu `regularClose` (dnešná close cena) oddelený od jobu na `previousClose`?**
    Ak nie:
    - skús navrhnúť, ako ich oddeliť:
      - cron po close (nastaví `regularClose`),
      - cron pred open ďalší deň (nastaví `previousClose`).

18. **Čo sa stane, ak jeden z cronov zlyhá (timeout, chyba API)?**
    - Logovanie?
    - Alert?
    - Máme retry mechanizmus / ochranu proti tomu, že budeme mať prázdny `DailyRef` pre daný deň?

---

### 5️⃣ API endpointy – dataflow & edge cases

19. **Pre každý endpoint (`/api/stocks`, `/api/heatmap`, `/api/prices` atď.) sprav diagram:**
    - odkiaľ berie:
      - statické dáta,
      - previous close,
      - aktuálnu cenu,
      - market cap,
      - market cap diff,
    - a over, že nikde nie je nepotrebný query / API call.

20. **Existujú rozdiely v tom, ako `/api/stocks` a `/api/heatmap` počítajú market cap a percent change?**
    Ak áno:
    - popíš rozdiely,
    - navrhni jednotnú funkciu / shared modul.

21. **Čo robí každý endpoint, keď chýbajú:**
    - `Ticker` dáta,
    - `DailyRef` dáta,
    - `SessionPrice` dáta?
    Prosím, skús nájsť všetky miesta, kde sa tento stav rieši (fallbacky, defaulty).

22. **Je niekde silent fail pri chýbajúcich dátach (len `console.warn` + 0 hodnoty)?**
    Ak áno, navrhni konzistentnú politiku:
    - logovanie + označenie tickera ako „invalid/incomplete",
    - alebo úplné vynechanie z respondu.

---

### 6️⃣ Cache (Redis, ETag, TTL) a výkon

23. **Je ETag generovaný vždy správne pri zmene dát v DB/Redis?**
    Over:
    - čo sa stane, keď update-uješ `SessionPrice` / `DailyRef` – vie o tom endpoint pri generovaní ETagu?
    - nehrozí, že klient dostane 304, hoci sa ceny zmenili?

24. **Je batch `mGet` na Redis využitý všade, kde ťaháme viac tickerov naraz?**
    Skontroluj, či:
    - niekde používame `get` v cykle namiesto `mGet`,
    - či by sme vedeli počet Redis volaní ešte znížiť.

25. **Sú TTL nastavené rozumne vzhľadom na účel stránky?**
    - `/api/heatmap` – TTL 10 s vs. real-time pocit,
    - `/api/stocks` – TTL 120 s.
    Navrhni, či by pre pre-market/otvorený trh nebolo vhodné iné TTL.

26. **Aký je reálny response time pri:**
    - 10 tickeroch,
    - 100 tickeroch,
    - 600+ tickeroch?
    Over, či niekde nie je skrytý N+1 DB query / JSON transform performance problém.

---

### 7️⃣ Robustnosť, chyby, monitoring

27. **Kde všade sa chyby z Polygon API len logujú a kde reálne ovplyvnia output (napr. null, 0, vynechaný ticker)?**
    Skús spraviť mapu:
    - „Polygon fail → ako vyzerá odpoveď endpointu?"

28. **Existuje centrálne miesto na mapovanie Polygon chýb (rate limit, 5xx, network error)?**
    Ak nie:
    - navrhni `handlePolygonError` utilitu + jednotnú stratégiu:
      - retry x krát,
      - fallback na staršie dáta,
      - alebo označenie tickera ako „dočasne bez dát".

29. **Má aplikácia monitoring / alerting pre situácie, keď:**
    - worker nebeží,
    - cron sa nespustí / zlyhá,
    - Redis nie je dostupný,
    - db query trvajú pridlho?
    Ak nie, navrhni, kde pridať aspoň základne logy / healthcheck endpoint.

---

### 8️⃣ Rozšíriteľnosť do budúcna

30. **Je návrh dát (Ticker/DailyRef/SessionPrice) pripravený na:**
    - viac trhov (US + EU),
    - viac typov assetov (ETF, indexy, crypto)?
    Ak nie, čo by sa muselo zmeniť (napr. `exchange`, `assetType`)?

31. **Je teraz jednoduché pridať ďalší „view" nad dátami (napr. earnings heatmap, top movers tab)?**
    Over, či business logika (výpočet % change, market cap diff) je v samostatných helperoch, nie roztrúsená po endpointoch.

---

## 🎯 Ako použiť tento prompt

1. **Skopíruj celý obsah** tohto súboru
2. **Vlož do Cursor** s inštrukciou: "Prosím, urob systematický audit podľa týchto otázok. Pre každú otázku:"
   - Nájdi relevantný kód
   - Analyzuj aktuálny stav
   - Identifikuj problémy
   - Navrhni riešenia
   - Vytvor zoznam akcií (TODO list)

3. **Alebo použij po častiach** - začni s najkritickejšími sekciami (1-3) a postupne prejdi cez ostatné.

---

**Poznámka:** Tento audit je navrhnutý tak, aby odhalil slabé miesta v dataflow, logike aj výkone. Očakáva sa, že niektoré otázky môžu odhaliť problémy, ktoré treba riešiť postupne.

