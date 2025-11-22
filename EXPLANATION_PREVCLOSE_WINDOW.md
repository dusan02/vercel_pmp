# Vysvetlenie okna "Fetched prevClose for..."

## Čo sa deje?

Okno, ktoré vidíš, zobrazuje výstup z funkcie `getPreviousClose()` v `marketCapUtils.ts`. Táto funkcia sa volá z `/api/heatmap` endpointu, ktorý načítava previous close ceny pre každý ticker z Polygon API.

## Prečo sa to deje?

Keď otvoríš stránku `/heatmap`, frontend volá `/api/heatmap` endpoint, ktorý:
1. Načíta tickery z databázy
2. Pre každý ticker, ktorý nemá `previousClose` v databáze, volá Polygon API
3. Zobrazuje správu "✅ Fetched prevClose for [TICKER]: $[VALUE]" pre každý načítaný ticker

## Ako to zastaviť?

### Možnosť 1: Počkaj, kým sa dokončí
- Proces sa dokončí sám po spracovaní všetkých tickerov
- Pre ~600 tickerov to môže trvať niekoľko minút (200ms delay medzi requestmi)

### Možnosť 2: Zatvor stránku
- Zatvor tab v prehliadači s `/heatmap` stránkou
- To zastaví API requesty

### Možnosť 3: Reštartuj server
- Zastav server (Ctrl+C v termináli)
- Spusti znova: `npm run dev`

## Oprava (už implementovaná)

✅ **Pridaný tichý režim** - API endpointy už nezobrazujú stovky logov
- Logy sa zobrazujú len pri manuálnych skriptoch
- API endpointy bežia ticho v pozadí

## Optimalizácia (budúce)

Pre rýchlejšie načítanie by bolo dobré:
1. Batch fetch previous closes (nie jeden po druhom)
2. Použiť Redis cache pre previous closes
3. Načítať previous closes v workeri, nie v API endpointe

