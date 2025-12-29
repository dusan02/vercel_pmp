# 🔍 Identifikované potenciálne chyby v sector/industry

## Technology/Communication Equipment

Z výsledkov SQLite dotazu vidím niekoľko tickerov, ktoré sú zjavne nesprávne zaradené:

### Zjavne nesprávne:
- **DLTR** (Dollar Tree) - malo by byť `Consumer Cyclical / Discount Stores`
- **DTE** (DTE Energy) - malo by byť `Utilities / Utilities - Regulated Electric`
- **EQT** (EQT Corporation) - malo by byť `Energy / Oil & Gas E&P`
- **ETR** (Entergy) - malo by byť `Utilities / Utilities - Regulated Electric`
- **FAST** (Fastenal) - malo by byť `Industrials / Industrial Distribution`
- **HLT** (Hilton) - malo by byť `Consumer Cyclical / Lodging`
- **MNST** (Monster Beverage) - malo by byť `Consumer Defensive / Beverages - Non-Alcoholic`
- **MTCH** (Match Group) - malo by byť `Technology / Software` (nie Communication Equipment)

### Potrebujú overenie:
- **ANET** (Arista Networks) - môže byť správne (network equipment)
- **CSCO** (Cisco) - správne (network equipment)
- **INTU** (Intuit) - malo by byť `Technology / Software` (nie Communication Equipment)
- **NTAP** (NetApp) - malo by byť `Technology / Information Technology Services`

## Real Estate/REIT - Specialty

Potrebujeme skontrolovať, či všetky tickery s `Real Estate/REIT - Specialty` sú skutočne REIT spoločnosti.

## Ďalšie kroky

1. Spustiť SQL príkaz s názvami spoločností na zobrazenie všetkých tickerov
2. Manuálne overiť každý ticker
3. Vytvoriť zoznam opráv
4. Aplikovať opravy podobne ako pre TPL, STZ, NOW

