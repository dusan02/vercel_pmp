# 🚀 Production Data Reset Instructions

## 📋 Overview
Tento dokument obsahuje inštrukcie pre kompletný reset dát na produkcii a načítanie nových, správnych dát pre všetkých 503 tickerov.

## ⚠️ Safety Warning
**Tieto skripty vymažú všetky existujúce dáta na produkcii!** Použite len ak ste si istý, že chcete resetovať všetky dáta.

## 🛠️ Available Scripts

### 1. Data Reset (`reset-prod-data`)
Resetuje všetky dáta tickerov a vyčistí súvisiace tabuľky.

```bash
# Safety check - required for production
export FORCE_PRODUCTION_RESET=true
export PROD_DATABASE_URL="your-production-db-url"

# Run reset
npm run reset-prod-data
```

**Čo robí:**
- ✅ Resetuje `name`, `sector`, `industry` pre všetkých 503 tickerov
- ✅ Vymaže `SessionPrice` tabuľku
- ✅ Vymaže `DailyRef` tabuľku  
- ✅ Vyčistí Redis cache
- ✅ Pripraví databázu na nové dáta

### 2. Data Refresh (`refresh-prod-data`)
Načíta nové, správne dáta pre všetkých tickerov z viacerých zdrojov.

```bash
export PROD_DATABASE_URL="your-production-db-url"
export POLYGON_API_KEY="your-polygon-api-key"

# Run refresh
npm run refresh-prod-data
```

**Čo robí:**
- ✅ Načíta názvy spoločností z Polygon API
- ✅ Pridelá sektory podľa 503 US ticker listu
- ✅ Pridelá industries podľa sektorov
- ✅ Získá aktuálne ceny a market cap
- ✅ Aktualizuje všetkých 503 tickerov
- ✅ Spracováva v batchoch (10 tickerov naraz)

### 3. Validation (`validate-tickers`)
Overí kvalitu a kompletnosť dát po refreshi.

```bash
npm run validate-tickers
```

**Čo kontroluje:**
- ✅ Počet tickerov (503)
- ✅ Kompletnosť dátových polí
- ✅ Sektorovú kategorizáciu
- ✅ Konzistenciu dát
- ✅ Kvalitné skóre

### 4. Data Quality Check (`check-data-quality`)
Špeciálna validácia pre SP500 kategorizáciu.

```bash
npm run check-data-quality
```

**Čo kontroluje:**
- ✅ SP500 pokrytie (500+ tickerov)
- ✅ Sektorovú distribúciu
- ✅ Tier rozdelenie
- ✅ Redis universe populáciu

### 5. Update Universe (`update-universe`)
Aktualizuje Redis universe a spustí automatické pipeline.

```bash
npm run update-universe
```

**Čo robí:**
- ✅ Aktualizuje Redis universe s 503 tickerov
- ✅ Spustí tiered updates
- ✅ Nastaví monitoring
- ✅ Aktualizuje cache

## 🔄 Complete Production Reset Process

### Step 1: Backup (Optional)
```bash
# Backup existing data
pg_dump your_production_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Reset Data
```bash
export FORCE_PRODUCTION_RESET=true
export PROD_DATABASE_URL="postgresql://user:pass@host:5432/db"
npm run reset-prod-data
```

### Step 3: Refresh Data
```bash
export PROD_DATABASE_URL="postgresql://user:pass@host:5432/db"
export POLYGON_API_KEY="your_polygon_key"
npm run refresh-prod-data
```

### Step 4: Validate Results
```bash
npm run validate-tickers
npm run check-data-quality
```

### Step 5: Update Cache
```bash
npm run update-universe
```

## 📊 Expected Results

Po úspešnom resete a refreshi by ste mali mať:

### ✅ Ticker Data
- **503 tickerov** v databáze
- **100% pokrytie** všetkých dátových polí
- **Správne sektory** pre všetkých 503 tickerov
- **Aktuálne ceny** a market cap dáta

### ✅ Sector Distribution
```
Technology: ~150 tickerov
Financial Services: ~80 tickerov
Healthcare: ~60 tickerov
Consumer Discretionary: ~50 tickerov
Consumer Staples: ~30 tickerov
Energy: ~25 tickerov
Industrials: ~20 tickerov
Materials: ~15 tickerov
Real Estate: ~10 tickerov
Utilities: ~8 tickerov
Communication Services: ~5 tickerov
```

### ✅ Data Quality
- **Overall completeness**: >95%
- **Data consistency**: >98%
- **Validation score**: >90%

## 🔧 Environment Variables

Nastavte tieto premenné prostredia:

```bash
# Production database
export PROD_DATABASE_URL="postgresql://user:password@host:5432/database"

# Polygon API (pre data refresh)
export POLYGON_API_KEY="your_polygon_api_key"

# Redis (pre cache)
export REDIS_URL="redis://localhost:6379"

# Cron secret (pre API volania)
export CRON_SECRET_KEY="your_cron_secret"
```

## 🚨 Troubleshooting

### Common Issues

#### 1. "Production database URL not found"
```bash
export PROD_DATABASE_URL="your_actual_production_db_url"
```

#### 2. "Polygon API rate limit"
```bash
# Skript automaticky delay medzi batchmi
# Možno znížiť batch size v production-data-refresh.cjs
```

#### 3. "Redis connection failed"
```bash
# Redis je voliteľný, skript bude fungovať aj bez neho
export REDIS_URL="redis://localhost:6379"
```

#### 4. "Force production reset required"
```bash
export FORCE_PRODUCTION_RESET=true
```

## 📈 Monitoring

Po refreshi môžete monitorovať stav:

### Health Check
```bash
curl https://your-domain.com/api/health
```

### Data Quality
```bash
curl -X POST https://your-domain.com/api/cron/comprehensive-ticker-validation \
  -H "Authorization: Bearer $CRON_SECRET_KEY"
```

### Cache Status
```bash
curl https://your-domain.com/api/cache/status
```

## 🎯 Success Criteria

Reset je úspešný ak:

- ✅ **503 tickerov** má kompletné dáta
- ✅ **Všetky sektory** sú správne priradené
- ✅ **Validácie prechádzajú** s >90% skóre
- ✅ **Redis universe** je populovaný
- ✅ **API endpoints** fungujú správne
- ✅ **Monitoring** ukazuje dobrú kvalitu dát

## 📞 Support

Ak narazíte na problémy:

1. **Check logs**: Všetky skripty majú detailné logy
2. **Run validation**: `npm run validate-tickers`
3. **Check environment**: Uistite sa, že všetky premenné sú nastavené
4. **Monitor progress**: Skripty ukazujú priebeh v real-time

---

**⚠️ Important:** Testujte vždy najprv na staging pred produkčným deployom!
