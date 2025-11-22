# Heatmap Metric Switcher - Implementation Summary

## ✅ Implementované zmeny

### 1. Typy a rozhrania

**`MarketHeatmap.tsx`:**
- ✅ Pridaný typ `HeatmapMetric = 'percent' | 'mcap'`
- ✅ Aktualizovaný `CompanyNode` typ - pridané `marketCapDiffAbs?: number`
- ✅ Pridaný `metric?: HeatmapMetric` prop do `MarketHeatmapProps`

### 2. Logika výpočtu veľkosti dlaždíc

**`buildHierarchy()` funkcia:**
- ✅ Upravená na prijatie `metric` parametra
- ✅ V režime `'percent'`: používa `marketCap` (pôvodné správanie)
- ✅ V režime `'mcap'`: používa `marketCapDiffAbs` (nový režim)
- ✅ Automatický fallback: `marketCapDiffAbs || Math.abs(marketCapDiff || 0)`

### 3. Labely v dlaždiciach

**Formátovanie:**
- ✅ Pridaná funkcia `formatMarketCapDiff()` - formátuje na `+$34.2B`, `-$1.5B`, atď.
- ✅ Labely sa menia podľa metriky:
  - `'percent'`: zobrazuje `+2.34%`
  - `'mcap'`: zobrazuje `+$34.2B`

### 4. UI prepínač

**`ResponsiveMarketHeatmap.tsx`:**
- ✅ Pridaný state `metric` s default hodnotou `'percent'`
- ✅ Pridaný handler `handleMetricChange()`
- ✅ Pridaný prepínač v UI (top-left corner):
  - Tlačidlá: "% Change" a "Mcap Change"
  - Aktívny režim má modrú farbu
  - Hover efekty

### 5. Transformácia dát

**`transformStockDataToCompanyNode()`:**
- ✅ Automaticky počíta `marketCapDiffAbs = Math.abs(marketCapDiff)`
- ✅ Backend nemusí posielať `marketCapDiffAbs`, frontend si ho vypočíta

## 📊 Ako to funguje

### Režim "% Change" (default)
- **Veľkosť dlaždice**: `marketCap` (aktuálny market cap)
- **Farba**: `percentChange` (zelená/červená podľa % zmeny)
- **Label**: `+2.34%` (percentuálna zmena)
- **Význam**: "Kto percentuálne letí"

### Režim "Mcap Change" (nový)
- **Veľkosť dlaždice**: `marketCapDiffAbs` (absolútna hodnota nominálnej zmeny)
- **Farba**: `percentChange` (stále podľa % zmeny - konzistentné)
- **Label**: `+$34.2B` (nominálna zmena market capu)
- **Význam**: "Kto dnes reálne hýbe trhom peniazmi"

## 🎨 UX

- Prepínač je v ľavom hornom rohu heatmapy
- Plynulá zmena veľkosti dlaždíc pri prepnutí metríky
- Farba zostáva konzistentná (vždy podľa % zmeny)
- Labely sa automaticky menia podľa režimu

## 🔧 Technické detaily

1. **D3 Treemap**: `.sum()` používa správnu hodnotu podľa metriky
2. **Performance**: Zmena metriky nevyžaduje nový API request
3. **Backward compatibility**: Default režim je `'percent'` (pôvodné správanie)

## 📝 Poznámky

- Backend už posiela `marketCapDiff` v `/api/heatmap` endpointe
- `marketCapDiffAbs` sa počíta na frontende pre flexibilitu
- Farba zostáva viazaná na `percentChange` v oboch režimoch (podľa požiadavky)

