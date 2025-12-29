# 🔄 Automatická aktualizácia dát v tabuľkách

## Problém
- Heatmapa sa aktualizovala automaticky každých 30 sekúnd
- Tabuľky (Portfolio, Favorites, All Stocks) mali staré dáta a aktualizovali sa len po refreshi stránky (Ctrl+F5)
- Používatelia museli manuálne refreshovať stránku, aby videli aktuálne dáta

## Riešenie
Pridaná automatická aktualizácia dát každých 30 sekúnd (rovnako ako heatmapa):

### 1. `useStockData` hook
- Pridaný auto-refresh mechanizmus, ktorý obnovuje dáta každých 30 sekúnd
- Obnovuje favorites a top 50 stocks (silent refresh - bez loading state)
- Začína 30 sekúnd po načítaní stránky

### 2. `StocksClient` komponent
- Pridaný `refreshInterval: 30000` do SWR konfigurácie
- Automaticky revaliduje dáta každých 30 sekúnd

## Výsledok
✅ Všetky sekcie (heatmapa aj tabuľky) sa teraz aktualizujú automaticky každých 30 sekúnd
✅ Používatelia vidia aktuálne dáta bez potreby manuálneho refreshu
✅ Dáta sú synchronizované medzi heatmapou a tabuľkami

## Technické detaily
- Refresh interval: **30 sekúnd** (rovnako ako heatmapa)
- Silent refresh: bez zobrazovania loading state (aby neobťažoval používateľa)
- Optimalizované: používa existujúce fetch funkcie, bez duplikácie kódu

