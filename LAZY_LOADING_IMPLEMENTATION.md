# Lazy Loading Implementation

## Prehľad

Implementoval som lazy loading pre akcie, ktorý zlepšuje výkon aplikácie načítaním prvých 30 akcií hneď a potom načítavaním ďalších pri scrollovaní.

## Implementované zmeny

### 1. Nový Hook: `useLazyLoading`

**Súbor:** `src/hooks/useLazyLoading.ts`

Hook poskytuje:
- `displayLimit`: Aktuálny počet zobrazených položiek
- `isLoading`: Stav načítavania
- `hasMore`: Či sú dostupné ďalšie položky
- `loadMore`: Funkcia na načítanie ďalších položiek
- `reset`: Resetovanie na počiatočný stav

**Parametre:**
- `initialLimit`: Počiatočný počet položiek (30)
- `incrementSize`: Veľkosť prírastku (30)
- `totalItems`: Celkový počet položiek
- `threshold`: Vzdialenosť od spodku pre spustenie načítania (200px)

### 2. Upravená hlavná stránka

**Súbor:** `src/app/page.tsx`

Zmeny:
- Pridaný import `useLazyLoading` hooku
- Pridaný import `Loader2` ikony z Lucide React
- Implementovaný lazy loading pre tabuľku akcií
- Pridané loading indikátory
- Upravený zobrazený počet akcií

### 3. CSS štýly

**Súbor:** `src/app/globals.css`

Pridané štýly pre:
- `.loading-indicator`: Loading indikátor s animáciou
- `.end-of-list`: Indikátor konca zoznamu
- Responzívne štýly pre dark mode

## Funkcionalita

### Počiatočné načítanie
- Načíta sa prvých 30 akcií hneď po načítaní stránky
- Rýchle zobrazenie obsahu pre lepšiu UX

### Scroll-based loading
- Pri scrollovaní do spodku sa automaticky načítajú ďalšie akcie
- Každý prírastok obsahuje 30 akcií
- Loading indikátor sa zobrazí počas načítavania

### Resetovanie
- Pri zmene filtrov sa lazy loading resetuje
- Zobrazí sa opäť prvých 30 akcií

### Indikátory
- **Loading indikátor:** Zobrazí sa počas načítavania ďalších akcií
- **End of list:** Zobrazí sa, keď sú všetky akcie načítané
- **Počet akcií:** Zobrazuje aktuálny počet zobrazených akcií z celkového počtu

## Výhody

1. **Rýchlejšie načítanie stránky** - len prvých 30 akcií sa načíta hneď
2. **Lepšia UX** - používateľ vidí obsah rýchlejšie
3. **Šetrenie zdrojov** - načítavajú sa len potrebné dáta
4. **Plynulé scrollovanie** - ďalšie akcie sa načítavajú automaticky
5. **Responzívne** - funguje na všetkých zariadeniach

## Technické detaily

### Scroll detection
- Používa `window.addEventListener('scroll')` s passive listenerom
- Kontroluje vzdialenosť od spodku dokumentu
- Automaticky spúšťa načítanie pri priblížení sa k spodku

### Performance optimizácie
- Debounced scroll handling
- Passive event listeners
- Minimal re-renders
- Efficient state management

### Accessibility
- Loading indikátory sú dostupné pre screen readery
- Jasné indikácie stavu načítavania
- Keyboard navigation podporované

## Použitie

Lazy loading sa automaticky aktivuje na hlavnej stránke. Používateľ nemusí nič robiť - stačí scrollovať dole a ďalšie akcie sa načítajú automaticky.

## Konfigurácia

Hodnoty môžu byť upravené v `useLazyLoading` hooku:
- `initialLimit`: Počiatočný počet akcií (aktuálne 30)
- `incrementSize`: Veľkosť prírastku (aktuálne 30)
- `threshold`: Vzdialenosť pre spustenie načítania (aktuálne 200px) 