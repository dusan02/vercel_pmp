# 🔧 Oprava Portfolio dát

Ak máte v Portfolio sekcii neplatné hodnoty (napr. "1e+210" alebo veľké pretekanie čísel), postupujte takto:

## Automatická oprava

Aplikácia automaticky opraví neplatné hodnoty pri načítaní:
- Hodnoty nad 1,000,000 sa automaticky znížia na maximum
- Scientific notation sa automaticky opraví
- Neplatné hodnoty sa odstránia

**Ak sa zmeny nezobrazujú:**
1. **Hard Refresh** stránky: `Ctrl+Shift+R` (Windows) alebo `Cmd+Shift+R` (Mac)
2. **Vyčistiť localStorage** (pozri nižšie)

## Manuálne vyčistenie

### Cez Developer Console (F12)

```javascript
// 1. Vyčistiť portfolio dáta
localStorage.removeItem('pmp_portfolio_holdings');

// 2. Hard reload
location.reload();
```

### Kompletná oprava všetkých dát

```javascript
// Vyčistiť všetko a reloadnúť
localStorage.clear();
sessionStorage.clear();
location.reload();
```

## Overenie opravy

Po oprave by ste mali vidieť:
- ✅ Hodnoty v stĺpci "#" maximálne 1,000,000
- ✅ Kompaktné formátovanie veľkých súm (napr. "$1.23T" namiesto dlhých čísel)
- ✅ Žiadne scientific notation (napr. "1e+210")

## Technické detaily

- **Limit:** 1,000,000 akcií na ticker
- **Formátovanie:** Kompaktný formát pre sumy nad $1M
- **Validácia:** Automatická pri načítaní a pri každej zmene

