# Oprava duplikovaného načítavania dát v heatmap endpointe

## Problém

API endpoint `/api/heatmap` sa volal 3-4x a načítaval tie isté dáta, pretože:
1. **Verzia sa incrementovala pri každom requeste** - aj keď dáta boli rovnaké
2. **`_timestamp` sa nastavoval na aktuálny čas** - nie na timestamp z dát
3. **Force refresh pri mount** - frontend volal `loadData(true)` pri každom mounte

## Riešenie

### 1. Inteligentné incrementovanie verzie
- Verzia sa incrementuje **len ak**:
  - Je to prvý cache (verzia neexistuje)
  - Dáta sú príliš staré (> 5 minút)
  - Dáta sa skutočne zmenili (nový `lastUpdated` timestamp)
- **NIE** pri každom requeste s rovnakými dátami

### 2. Správny timestamp
- `_timestamp` sa nastavuje na `maxUpdatedAt` z SessionPrice (nie aktuálny čas)
- To zabezpečuje, že rovnaké dáta majú rovnaký timestamp

### 3. Cache-first prístup
- Frontend volá `loadData(false)` pri mounte (nie `force=true`)
- Použije cache, ak existuje a je fresh
- Force refresh len ak cache neexistuje alebo je prázdny

## Výsledok

- ✅ Endpoint sa volá len raz pri mounte (ak cache existuje)
- ✅ Verzia sa incrementuje len pri skutočnej zmene dát
- ✅ Rovnaké dáta majú rovnaký timestamp
- ✅ Menej API requestov = rýchlejšie načítanie

