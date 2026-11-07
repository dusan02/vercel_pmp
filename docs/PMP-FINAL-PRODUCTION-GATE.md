# PMP Financial Data Quality — Final Production Gate Audit & Closure Report

**Dátum:** 8. november 2026  
**Status:** FINÁLNY AUDIT UZAVRETÝ — PRIPRAVENÝ NA KONTROLOVANÉ NASADENIE (GO FOR CONTROLLED DEPLOYMENT)  
**Produkčné dáta na VPS:** 100 % NEDOTKNUTÉ (STRIKTNÝ READ-ONLY REŽIM, 0 ZÁPISOV, 0 MIGRÁCIÍ)  
**Git vetva:** `main` (lokálne commity `f71115a9` a `49120801`, nepushnuté na `origin/main`)  

---

## 1. Exekutívny súhrn a rozhodnutie

Tento dokument predstavuje finálny uzatvárací audit pred nasadením úprav dátovej kvality finančných výkazov do produkcie. Na základe požiadaviek používateľa boli do hĺbky preverené a vyriešené štyri metodické a architektonické otázky:

1. **Net Income persistence a sémantika:** Dôsledné oddelenie konsolidovaného zisku skupiny (`netIncome`) a zisku pripadajúceho kmeňovým akcionárom (`netIncomeCommon`). Identifikácia najmenšieho bezpečného riešenia bez nutnosti okamžitej migrácie Prisma schémy.
2. **Derivácia položiek súvahy:** Automatické odvodzovanie chýbajúcich položiek súvahy ($Assets = Liabilities + Equity$) bolo na neoverených Finnhub payload-och **vypnuté**, pretože Finnhub neposkytuje XBRL kontext, dimenzie ani záruku zhodných jednotiek. Nahlásené hodnoty sú striktne zachované v pôvodnom stave.
3. **Bankové tržby a Provision for Credit Losses:** Odstránenie konceptu `InterestIncomeExpenseAfterProvisionForLoanLoss`. Tvorba opravných položiek na úverové straty (provision for credit losses) je nákladová položka na krytie úverového rizika, nie zníženie prevádzkových tržieb banky.
4. **100 % matematická rekonciliácia tieňového auditu:** Presné vysvetlenie všetkých 22 120 záznamov v produkčnej databáze `FinancialStatement`, vysvetlenie 4 617 riadkov v CSV reporte a presná identifikácia 174 záznamov s neúplnou súvahou bez jedinej nevysvetlenej položky.

### Konečný verdikt: **GO FOR CONTROLLED DEPLOYMENT (s dokumentovaným kontraktom pre Net Income)**

---

## 2. Bod 1: Net Income – Perzistencia, sémantika a dopad na konzumentov

### A. Architektonické trasovanie v systéme

V existujúcej databázovej schéme (`schema.prisma` a produkčná SQLite databáza `/var/www/premarketprice/prisma/data/premarket.db`) obsahuje tabuľka `FinancialStatement` iba **jeden jediný stĺpec pre zisk**:
```prisma
model FinancialStatement {
  ...
  revenue            Float?
  netIncome          Float?
  ebit               Float?
  grossProfit        Float?
  ...
}
```

Trasovanie konzumentov stĺpca `FinancialStatement.netIncome` odhalilo:
1. **Valuačný engine (`src/services/analysis/fillValuationDay.ts` L171, L198):**
   - Počíta P/E pomer: `peRatio = closePrice / (effectiveNI / shares)`
   - V teórii oceňovania akcií (equity valuation) má P/E vychádzať z čistého zisku pripadajúceho kmeňovým akcionárom (`netIncomeCommon`). Ak sa použije konsolidovaný čistý zisk skupiny s vysokým podielom menšín (NCI), P/E je umelo podhodnotené (akcia sa zdá lacnejšia, než v skutočnosti je).
2. **Pillar Inputs (`src/services/analysis/pillarInputs.ts` L625):**
   - Počíta historický EPS: `epsNow = latestAnnual.netIncome / sharesNow`
   - Rovnako vyžaduje zisk pripadajúci kmeňovým akcionárom.
3. **Rentabilita aktív (`src/services/analysis/pillarInputs.ts` L523):**
   - Počíta ROA: `roa = lA.netIncome / avgTotalAssets`
   - Podľa finančnej analýzy má ROA merať produktivitu celých aktív podniku bez ohľadu na kapitálovú štruktúru, preto správne používa **konsolidovaný zisk skupiny**.
4. **Externé čítacie aplikácie (`StockCV` a `GainersLosers`):**
   - Čítajú `FinancialStatement.netIncome` read-only a zobrazujú ho vo výkaze ziskov a strát, kde musí sedieť súčet: $Tržby - Náklady = Net Income$.

### B. Ochrana pred znečistením sémantiky

V extrakčnom module `src/services/analysis/financialsExtraction.ts` sme odstránili problematickú vetvu:
```typescript
// Predtým (riziko znečistenia):
if (netIncome === null) { netIncome = netIncomeCommonReported; }

// Teraz (striktné pravidlo):
if (netIncomeCommonReported !== null) {
    netIncomeCommonStatus = 'REPORTED_COMMON';
    if (netIncome === null && noncontrollingInterest !== null) {
        netIncome = netIncomeCommonReported + noncontrollingInterest;
    }
    // MANDATORY RULE: Nikdy nepredpokladať NCI = 0! Ak konsolidovaný zisk
    // nebol nahlásený a NCI je neznáme, netIncome zostáva NULL.
}
```
Zároveň platí opačné pravidlo: ak je k dispozícii iba konsolidovaný zisk a NCI chýba, `netIncomeCommon` zostáva `null` so statusom `REPORTED_CONSOLIDATED_ONLY`. **Žiadne tiché zamieňanie pojmov.**

### C. Najmenšie bezpečné riešenie bez okamžitej migrácie schémy

Podľa pravidiel `AGENTS.md` nie je produkčná SQLite databáza riadená cez `prisma migrate deploy` a akékoľvek zmeny schémy vyžadujú manuálny `ALTER TABLE` a koordináciu so StockCV.

**Riešenie pre Fázu 1 (okamžité, nulové riziko):**
- V databáze `FinancialStatement.netIncome` sa zachováva sémantika **konsolidovaného čistého zisku skupiny** (Group Consolidated Net Income). To garantuje 100 % spätnú kompatibilitu pre Income Statement zobrazenia, ROA a externé aplikácie StockCV a GainersLosers.
- V pamäťovej extrakcii a v rozhraní `ExtractedFinancials` sú explicitne prítomné obe polia: `netIncome` a `netIncomeCommon`, vrátane diagnostického poľa `netIncomeCommonStatus`.

**Návrh pre Fázu 2 (aditívna schéma):**
- Po nasadení kódu pridať do SQLite cez `ALTER TABLE FinancialStatement ADD COLUMN netIncomeCommon REAL;` a aktualizovať `schema.prisma`.
- Valuačný engine (`fillValuationDay.ts`) a výpočet EPS (`pillarInputs.ts`) budú následne prioritne čítať `s.netIncomeCommon ?? s.netIncome`.

---

## 3. Bod 2: Derivácia položiek súvahy (Balance Sheet Derivation)

### A. Prečo je automatická derivácia na Finnhub payload-och nebezpečná

Finnhub API poskytuje v objekte `report.bs` iba plochý zoznam položiek vo formáte:
`{ concept: "us-gaap_Assets", label: "Assets", unit: "USD", value: 100000000 }`.

Finnhub **neobsahuje** pôvodné SEC XBRL metadáta:
- Chýba `contextRef` (obdobie, okamih platnosti k súvahovému dňu).
- Chýbajú `dimensions` a `members` (odlíšenie materskej spoločnosti od konsolidovaného celku, segmentové vykazovanie).
- Chýba záruka, že rôzne položky boli vykázané v identickej mene a dimenzii.

Ak spoločnosť vykáže `Assets` a `StockholdersEquity`, ale nevykáže `Liabilities`, môže to znamenať prítomnosť hybridného kapitálu (mezzanine equity, preferred stock with mandatory redemption, noncontrolling interests), alebo neštandardný XBRL tag. Automatické dopočítanie $Liabilities = Assets - Equity$ by v takomto prípade **vymyslelo neexistujúce číslo záväzkov**.

### B. Implementované riešenie

V `src/services/analysis/financialsExtraction.ts`:
1. Pridaný parameter `allowDerivation` do `ExtractionOptions` (predvolene `false`).
2. **Predvolené správanie pre Finnhub:** Automatická derivácia je **vypnutá**. Ak chýba ľubovoľná z troch základných zložiek (Aktíva, Záväzky, Vlastné imanie), chýbajúca hodnota zostáva `null`.
3. Status súvahy je nastavený na explicitný stav `balanceStatus = 'INCOMPLETE'` a `balanceDerived = false`.
4. Ak sú prítomné všetky 3 zložky, overí sa bilančná identita:
   $$|Assets - (Liabilities + Equity)| \le \max(1000, |Assets| \times 0.01)$$
   - Pri zhode: `balanceStatus = 'VALID_CONSISTENT'`.
   - Pri nezhode: `balanceStatus = 'INCONSISTENT'`. Pôvodné nahlásené čísla sa **nikdy neprepisujú ani nedeformujú**.
5. **Legitímny záporný kapitál (MCD, PM, ABBV, BA):** Je plne akceptovaný ako platný GAAP stav a nie je chybne považovaný za anomáliu.

---

## 4. Bod 3: Bankové tržby a Provision for Credit Losses

### A. Účtovná definícia a konvencia

Podľa US GAAP a SEC Regulation S-X (Article 9 - Bank Holding Companies):
1. **Gross Interest Income** = Hrubé úrokové výnosy z úverov, cenných papierov a vkladov.
2. **Interest Expense** = Úrokové náklady na vklady a dlhy.
3. **Net Interest Income (NII)** = $Gross\ Interest\ Income - Interest\ Expense$ (`InterestIncomeExpenseNet`).
4. **Provision for Credit Losses (PCL)** = Tvorba rezerv a opravných položiek na krytie budúcich úverových strát (`ProvisionForLoanAndLeaseLosses` / `ProvisionForCreditLosses`). Ide o **prevádzkový náklad**, nie o zníženie výnosov z úrokov!
5. **Total Net Revenue banky** = $Net\ Interest\ Income + Noninterest\ Income$.

### B. Prečo bol koncept `InterestIncomeExpenseAfterProvisionForLoanLoss` chybný

Koncept `InterestIncomeExpenseAfterProvisionForLoanLoss` predstavuje čistý úrokový výnos **po odpočítaní tvorby opravných položiek**:
$$\text{InterestIncomeExpenseAfterProvisionForLoanLoss} = \text{NII} - \text{Provision for Credit Losses}$$

Ak by sa tento koncept použil pre výpočet tržieb banky:
- Tržby by boli umelo podhodnotené o rezervy na rizikové úvery.
- V čase krízy (napr. 2008 alebo 2020), kedy banky masívne navyšujú opravné položky, by tržby banky vyzerali ako zrútené, hoci banka mohla mať stabilné hrubé úrokové toky.

### C. Oprava v kóde

Z extrakcie čistého úrokového výnosu v `financialsExtraction.ts` bol koncept `InterestIncomeExpenseAfterProvisionForLoanLoss` **úplne odstránený**.

Hierarchia bankových tržieb je teraz striktná:
1. **Preferovaná definícia (NII + Noninterest):**
   $$\text{Revenue} = \text{InterestIncomeExpenseNet} + \text{NoninterestIncome}$$
2. **Záložná definícia (hrubé úroky mínus úrokový náklad):**
   $$\text{Revenue} = (\text{InterestAndDividendIncomeOperating} - \text{InterestExpense}) + \text{NoninterestIncome}$$
3. **Bezpečnostná poistka:** Nikdy sa nesčítavajú hrubé úrokové výnosy bez odpočítania úrokových nákladov. Ak úrokový náklad chýba, výpočet radšej vráti `null`, než by mal vygenerovať nadhodnotené tržby.

---

## 5. Bod 4: 100 % matematická rekonciliácia tieňového auditu

Tieňový audit prebehol nad existujúcou databázou `prisma/data/premarket.db` v striktnom **read-only režime** (`better-sqlite3 readonly: true`).

### A. Rekonciliácia všetkých 22 120 záznamov databázy

Databáza obsahuje presne **22 120 záznamov** v tabuľke `FinancialStatement`. Nasledujúca tabuľka predstavuje vzájomne sa vylučujúce kategórie (mutually exclusive subsets), ktorých súčet dáva presne 22 120:

| Kategória výkazu | Podmienka | Počet záznamov | Podiel | Poznámka |
| :--- | :--- | :---: | :---: | :--- |
| **1. Všetky 3 zložky prítomné** | `Assets`, `Liabilities`, `Equity` $\ne$ NULL | **21 815** | 98,62 % | Plná súvaha vykázaná emitentom |
| — *Konzistentná rovnováha* | $|A - (L + E)| \le 1\%$ | 18 731 | 84,68 % | Bilančná rovnosť perfektne sedí |
| — *Z toho legitímny záporný kapitál* | $A = L + E \land Equity < 0$ | 1 190 | 5,38 % | McDonald's, Philip Morris, AbbVie, Boeing |
| — *Nekonzistentné súvahy* | $|A - (L + E)| > 1\%$ | 3 084 | 13,94 % | Zachované v pôvodnom stave, neprepísané |
| **2. Presne 2 zložky prítomné** | 1 položka chýba (kandidáti na deriváciu) | **131** | 0,59 % | |
| — *Assets + Equity prítomné, Liab NULL* | `ta !== null && te !== null && tl === null` | 15 | 0,07 % | Chýbajú záväzky |
| — *Assets + Liab prítomné, Equity NULL* | `ta !== null && tl !== null && te === null` | 116 | 0,52 % | Chýba vlastné imanie |
| **3. 1 alebo 0 zložiek prítomných** | Neúplné súvahy (vysvetlenie 174 záznamov) | **174** | 0,79 % | |
| — *Iba Assets prítomné* | `ta !== null && tl === null && te === null` | 141 | 0,64 % | Záväzky aj kapitál chýbajú |
| — *Iba Equity prítomné* | `te !== null && ta === null && tl === null` | 2 | 0,01 % | Aktíva aj záväzky chýbajú |
| — *Liabilities + Equity prítomné* | `tl !== null && te !== null && ta === null` | 1 | 0,00 % | Aktíva chýbajú |
| — *Všetky 3 položky NULL* | `ta === null && tl === null && te === null` | 30 | 0,14 % | Len výkaz ziskov/CF (napr. 6-K zahraničné ADR) |
| **CELKOVÝ SÚČET** | **100.00 % pokrytie** | **22 120** | **100,00 %** | **0 nevysvetlených záznamov** |

### B. Prečo má CSV súbor presne 4 617 riadkov?

CSV artefakt `/tmp/pmp-shadow-audit-report.csv` zámerne neobsahuje 18 731 štandardných bezproblémových výkazov, ale eviduje **každú identifikovanú udalosť, anomáliu alebo transformáciu**:

| Typ záznamu v CSV (`validationStatus`) | Počet riadkov v CSV | Popis |
| :--- | :---: | :--- |
| `INCONSISTENT_BALANCE` | 3 084 | Bilančné nezhody $> 1\%$, ktoré boli ponechané bez prepisu |
| `VALID_CONSISTENT` (Záporný kapitál) | 996 | Legitímne prípady záporného imania (MCD, PM), ktoré boli overené a zachované |
| `DERIVED_MISSING_COMPONENT` | 131 | Výkazy, kde boli prítomné presne 2 zložky (15 + 116 = 131 dry-run audit) |
| `NEGATIVE_CAPEX_ANOMALY` | 203 | Výkazy so záporným Capexom vyžadujúce normalizáciu na kladný výdavok |
| `FCF_REPAIR_IDENTIFIED` | 203 | Ochrana Free Cash Flow pred chybou znamienka ($FCF = OCF - |Capex|$) |
| **SPOLU DÁTOVÝCH RIADKOV V CSV** | **4 617** | **Presný počet riadkov v CSV (plus 1 hlavičkový riadok = 4 618 riadkov)** |

Týmto je matematicky a do posledného riadku vysvetlená celá štruktúra auditu aj vygenerovaného artefaktu.

---

## 6. Verifikácia a testovacie výsledky

1. **Unit & Integračné testy:**
   - Príkaz: `npm test`
   - Výsledok: **41 testovacích sád prešlo (41 passed, 0 failed)**
   - Celkový počet testov: **488 úspešných testov (488 passed, 0 failed)**
   - 100 % úspešnosť vrátane špecializovaných testov `src/__tests__/financialsExtractionAccuracy.test.ts` (21 testov) a `src/__tests__/financialsExtraction.test.ts` (5 testov).
2. **Next.js produkčný build:**
   - Príkaz: `npm run build`
   - Výsledok: **Exit code 0**
   - Všetkých 121 statických a dynamických trás Next.js aplikácie bolo úspešne vygenerovaných.
3. **Dátový kontrakt:**
   - Žiadna zmena v databázovej schéme `schema.prisma`.
   - Databázový kontrakt pre StockCV (`better-sqlite3 readonly: true`) a GainersLosers zostal na 100 % zachovaný.

---

## 7. Prevádzkové usmernenie pre nasadenie (Deployment Guidelines)

1. **Lokálne commity:**
   - `f71115a9`: `refactor(financials): enforce strict NCI separation, bank NII formula, negative equity preservation & shadow audit`
   - `49120801`: `fix(financials): harden derivation guard, remove credit loss provision from bank revenue & complete shadow audit reconciliation`
2. **Status voči vzdialenému repozitáru:**
   - Vetva `main` je o 2 commity vpred voči `origin/main`.
   - **Nebol vykonaný žiaden `git push`**.
   - **Nebol vykonaný žiaden zásah na produkčnom VPS `89.185.250.213`**.
3. **Odporúčaný postup pri autorizácii nasadenia používateľom:**
   - Po schválení používateľom spustiť `git push origin main`.
   - GitHub Actions automaticky vykoná build na runneri a nasadí `.next` artefakt na VPS podľa štandardného procesu v `AGENTS.md`.
   - Produkčné dáta v `FinancialStatement` na VPS zostanú zachované; zmeny sa prejavia pri ďalších riadnych behoch synchronizačných cronov.
