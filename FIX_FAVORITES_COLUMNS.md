# 🔧 Oprava stĺpcov v Favorites sekcii

## Problém
V sekcii Favorites boli hodnoty v nesprávnych stĺpcoch:
- **Cap Diff** - nemal farby (zelená/červená)
- **Price** - zobrazovali sa percentá namiesto cien
- **% Change** - zobrazoval sa Cap Diff namiesto percent

## Riešenie

### 1. Opravené poradie stĺpcov v `StockTableRow.tsx`
Zmenené poradie z:
- Market Cap → Price → % Change → Cap Diff

Na:
- Market Cap → **Cap Diff** → **Price** → **% Change**

### 2. Opravené poradie hlavičiek v `AllStocksSection.tsx`
Zmenené poradie hlavičiek, aby zodpovedalo `StockTableRow`:
- Market Cap → **Cap Diff** → **Price** → **% Change**

### 3. Farby pre Cap Diff
Cap Diff už mal správne CSS triedy (`positive`/`negative`), ktoré zobrazujú:
- **Zelenú** farbu pre kladné hodnoty
- **Červenú** farbu pre záporné hodnoty

## Sortovanie
Všetky tri stĺpce (Cap Diff, Price, % Change) sú sortovateľné:
- Kliknutie na hlavičku sortuje **DESC** (zostupne)
- Druhé kliknutie sortuje **ASC** (vzostupne)
- Funguje cez `useSortableData` hook

## Výsledok
✅ Cap Diff zobrazuje správne hodnoty so zelenou/červenou farbou
✅ Price zobrazuje ceny (nie percentá)
✅ % Change zobrazuje percentá (nie Cap Diff)
✅ Všetky stĺpce sú sortovateľné ASC/DESC

