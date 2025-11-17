# Výpočet plochy heatmapy - Normálne vs Fullscreen zobrazenie

## 📊 Prehľad výsledkov

### Typické rozlíšenia obrazovky

| Rozlíšenie | Normálne zobrazenie | Fullscreen zobrazenie | Rozdiel | Zvýšenie |
|------------|---------------------|----------------------|---------|----------|
| **Full HD (1920×1080)** | 1,958,400 px² | 2,073,600 px² | +115,200 px² | **+5.9%** |
| **2K QHD (2560×1440)** | 3,532,800 px² | 3,686,400 px² | +153,600 px² | **+4.3%** |
| **4K UHD (3840×2160)** | 8,064,000 px² | 8,294,400 px² | +230,400 px² | **+2.9%** |
| **Laptop (1366×768)** | 967,128 px² | 1,049,088 px² | +81,960 px² | **+8.5%** |
| **Ultrawide (2560×1080)** | 2,611,200 px² | 2,764,800 px² | +153,600 px² | **+5.9%** |
| **Ultrawide (3440×1440)** | 4,747,200 px² | 4,953,600 px² | +206,400 px² | **+4.3%** |

---

## 📐 Detailný výpočet pre Full HD (1920×1080)

### Normálne zobrazenie
- **Šírka:** 1920px (100% obrazovky)
- **Výška:** 1020px (1080px - 60px header)
- **Plocha:** 1,958,400 px²
- **Percento obrazovky:** 94.4%

**Komponenty:**
- Header: ~60px (text-xl + text-[9px] + padding px-2 py-1)
- Heatmap kontajner: `flex-1 min-h-0` → zaberie zvyšok

### Fullscreen zobrazenie
- **Šírka:** 1920px (100vw)
- **Výška:** 1080px (100vh)
- **Plocha:** 2,073,600 px²
- **Percento obrazovky:** 100.0%

**Komponenty:**
- Exit button: `absolute top-2 right-2` → neobmedzuje kontajner
- Heatmap kontajner: `position: absolute, inset: 0` → zaberie celú obrazovku

### Zvýšenie
- **Rozdiel:** +115,200 px²
- **Percentuálne zvýšenie:** +5.9%
- **To je 5.6% z celkovej obrazovky**

---

## 🔍 Analýza

### Prečo je rozdiel?
1. **Normálne zobrazenie:**
   - Header zaberie ~60px výšky
   - Heatmap kontajner má `flex-1` → `height: calc(100vh - 60px)`
   - Výsledok: `1920px × 1020px = 1,958,400 px²`

2. **Fullscreen zobrazenie:**
   - Žiadny header (skrytý)
   - Exit button je `absolute`, neobmedzuje kontajner
   - Heatmap kontajner má `inset: 0` → `100vw × 100vh`
   - Výsledok: `1920px × 1080px = 2,073,600 px²`

### Percentuálne zvýšenie podľa rozlíšenia
- **Najväčšie zvýšenie:** Laptop (1366×768) → **+8.5%**
- **Najmenšie zvýšenie:** 4K UHD (3840×2160) → **+2.9%**
- **Priemerné zvýšenie:** ~5-6%

**Dôvod:** Čím menšie rozlíšenie, tým väčší vplyv má header (60px je väčšie percento z celkovej výšky).

---

## 💡 Praktické dôsledky

### Pre užívateľa
- **Fullscreen režim poskytuje o 3-9% viac plochy** (v závislosti od rozlíšenia)
- **Na menších obrazovkách je rozdiel výraznejší** (8.5% na 1366×768)
- **Na väčších obrazovkách je rozdiel menší, ale absolútne väčší** (230,400 px² na 4K)

### Pre vývoj
- Header zaberie **60px výšky** v normálnom režime
- Exit button v fullscreen je **absolute**, takže neobmedzuje kontajner
- Kontajner v fullscreen používa **100vw × 100vh** (celá obrazovka)

---

## 📝 Poznámky

- Výpočet predpokladá, že header má výšku **~60px** (text-xl + text-[9px] + padding)
- Exit button v fullscreen je `absolute top-2 right-2`, takže neobmedzuje kontajner
- Všetky hodnoty sú v pixeloch (px)
- Plocha = šírka × výška

---

## 🎯 Záver

Fullscreen režim poskytuje **o 3-9% viac plochy** pre heatmapu v závislosti od rozlíšenia obrazovky. Najväčší rozdiel je na menších obrazovkách, kde header zaberie väčšie percento z celkovej výšky.

