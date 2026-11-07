# PMP M2B: Záverečná Správa o Uzavretí Výskumu (Project Closure Report)

**Dátum:** 7. november 2026  
**Status projektu:** 🛑 **STOP DEVELOPMENT (Definitívne uzavreté)**  
**Dôvod:** Stratégia M2B nepreukázala štatisticky signifikantnú alfu voči benchmarku SPY Total Return po odstránení dátových a exekučných skreslení.

---

## 1. Konečný Verdikt a Výsledková Matrica

Vývoj a nasadzovanie systematického modelu M2B (RSI2 + PEAD Breakout na jednotlivých akciách) sa definitívne ukončuje.

| Kritérium | M2B PIT (Auditované) | SPY Total Return | Hodnotenie |
| :--- | :---: | :---: | :---: |
| **CAGR (2021–2026)** | **11,33 %** | **14,24 %** | 🔴 Zaostáva o -2,91 % p.a. |
| **Max Drawdown** | **-29,35 %** | **-24,50 %** | 🔴 Hlbší prepad než index |
| **Sharpe Ratio ($r_f=3.5\%$)** | **0,53** | **0,78** | 🔴 Slabší pomer výnos/riziko |
| **Sortino Ratio** | **0,74** | **1,11** | 🔴 Slabšia ochrana pred stratami |
| **Calmar Ratio** | **0,39** | **0,58** | 🔴 Zaostáva |
| **Prínos PIT fundamentov** | **+0,43 % p.a. CAGR** | — | ⚪ Zanedbateľný prínos |
| **Platné OOS dôkazy** | **Žiadne** (kontaminované) | — | ⚪ Neoverené |

Model M2B na auditovaných dátach nepreukázal ani vyšší výnos, ani lepší pomer výnosu a rizika oproti pasívnemu držaniu SPY.

---

## 2. Kľúčové Zistenia a Forenzný Post-Mortem

1. **Pôvodných +475 % výnosu nemalo investičnú dôkaznú hodnotu:**  
   Výsledok vznikol súbehom troch zásadných skreslení:
   - *Same-Day Close Execution Bias:* Nákup za Close v tom istom okamihu, kedy sa vyhodnotil signál, pridal umelých **+196,8 percentuálnych bodov**.
   - *Look-Ahead Selection Bias:* Výber akcií cez statický snapshot `AnalysisCache` a `lastMarketCap >= 25B` z novembra 2026 retroaktívne v rokoch 2021–2023 obchodoval budúce 500 % až 2 000 % víťazy (`FIX`, `EME`, `SMCI`, `NVDA`).
   - *Survivorship Bias:* Zbankrotované a oslabené firmy (`FRC`, `SIVB`, `BBBY`) boli z histórie spätne vymazané.
   - *Understated Benchmark:* Pôvodný bot porovnával výsledok voči SPY Price Return (+98,8 %), čím ignoroval dividendy (+18,8 % bodov celkovo).
2. **Fundamentálny modul nepriniesol merateľnú výhodu:**  
   V ceteris paribus teste na identickej kohorte 27 firiem bol rozdiel medzi PIT fundamentmi (+86,98 %) a čisto technickým modelom (+82,76 %) iba **+0,43 % p.a. CAGR**. Komplexita extrakcie a normalizácie XBRL fundamentov nebola investične odmenená.
3. **Výsledky OOS (2024–2026) boli in-sample:**  
   Pretože pravidlá a dáta bota boli ladené v októbri/novembri 2026 na celej histórii, OOS obdobie bolo známe. Keď na tomto období bežala čistá stratégia bez znalosti moderných fundamentov, dosiahla CAGR iba **5,46 %** oproti **18,50 %** na SPY TR (alfa **-44,83 %**).
4. **Alokácia a trhový režim dominovali nad stock-pickingom:**  
   V silnom býčom roku 2023 samotný stock-picking bez Core overlayu vygeneroval iba **+0,93 %** oproti **+26,21 %** na SPY. Zisk v roku 2022 bol daný makro-filtrom `SPY < SMA200` (držanie hotovosti s 3,5 % úrokom), nie výberom jednotlivých akcií.

---

## 3. Katalóg Komponentov: Čo Sa Ukončuje a Čo Zostáva

| Komponent | Rozhodnutie | Zdôvodnenie & Stav |
| :--- | :---: | :--- |
| **M2B Swing Trading Engine** | 🛑 **Ukončiť** | Nepreukázaná alfa, zlyhanie na OOS, neobhájiteľné riziko na reálnom kapitáli. |
| **Fundamentálny Scoring & AnalysisCache** | 📦 **Odložiť** | Neprináša merateľnú alfu voči čistej technike (+0,43 % p.a. CAGR). |
| **PEAD / RSI2 / SMA200 Stock-Picking** | 🛑 **Bez ďalšieho vývoja** | Zastavenie akejkoľvek ďalšej optimalizácie a prelaďovania parametrov. |
| **PIT Dátová Architektúra** | ✅ **Zachovať ako infraštruktúru** | Modul `src/lib/quant/pit/` (`concept-registry.ts`, `timezone.ts`, `pit-filing-service.ts`) je čistý a reprodukovateľný. |
| **Historické Výkazy a Restatements** | ✅ **Zachovať** | V2 schéma a validačná metodika zostávajú ako archívny štandard. |
| **SPY SMA200 Režimový Filter** | 🔬 **Zachovať ako samostatnú hypotézu** | Ochrana pred medvedím trhom 2022 bola preukázaná; vyžaduje izolovaný test. |
| **Backtest Framework** | ✅ **Zachovať** | Skript `scripts/run-final-sprint-ablation.ts` s opravenou Next-Day exekúciou a SPY TR benchmarkom. |

---

## 4. Prípadný Budúci Výskumný Projekt (Izolovaná Asset Alokácia)

Ak sa v budúcnosti otvorí ďalší kvantitatívny výskum, **nebude to optimalizácia M2B ani výber jednotlivých akcií**.

Jediným zmysluplným výskumným projektom je čistý test taktickej alokácie aktív:
$$\mathbf{SPY\text{ Buy \& Hold}}\quad\text{vs.}\quad\mathbf{SPY\text{ SMA200}}\quad\text{vs.}\quad\mathbf{SPY\text{ SMA100 + Treasury Bills}}$$

### Požadované podmienky pre tento test (Preregistrovaný protokol):
1. **Benchmark:** SPY Total Return s presným reinvestovaním skutočných štvrťročných dividend.
2. **Exekúcia:** Striktná Next-Day Market-On-Open (alebo Market-On-Close) exekúcia bez intradenného predstihu.
3. **Hotovostný výnos:** Historické skutočné mesačné výnosy 3-mesačných amerických pokladničných poukážok (US 3M T-Bills / FRED DTB3), nie fixný odhad.
4. **Náklady:** Započítanie poplatkov brokerovi a modelovaného slippage.
5. **Dátové rozdelenie:** Trhové cykly 2000–2020 ako In-Sample kalibrácia, 2021–2026 ako striktne uzamknuté a nedotknuté OOS.
6. **Kritérium úspechu:** Zlepšenie rizikovo očisteného výnosu (Sharpe / Sortino / Calmar) pri akceptovateľnej strate celkového výnosu (kompenzácia drawdownu vs. cost of missing the upside).

---

## 5. Záverečné Zhodnotenie

Tento výskumný šprint **nebol premárneným časom**. Odhalil skryté systémové chyby skôr, ako mohli spôsobiť reálnu stratu kapitálu na živom trhu. Najväčšou hodnotou systematického quant výskumu je schopnosť včas a disciplinovane zastaviť nefunkčnú stratégiu a odmietnuť pokušenie zakrývať nedostatky ďalším preoptimalizovaním.
