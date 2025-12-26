# 🔧 Oprava DATABASE_URL pre SQLite

## ⚠️ Problém
Prisma hlási chybu:
```
error: Error validating datasource `db`: the URL must start with the protocol `file:`.
```

## 🚀 Riešenie

### 1. Skontrolovať aktuálnu hodnotu DATABASE_URL

```bash
cd /var/www/premarketprice
grep DATABASE_URL .env
```

### 2. Opraviť DATABASE_URL

SQLite URL musí začínať s `file:` a použiť absolútnu cestu alebo relatívnu cestu.

**Možnosť A: Absolútna cesta (odporúčané pre produkciu)**
```bash
cd /var/www/premarketprice

# Skontrolovať, či existuje databázový súbor
ls -la prisma/data/premarket.db

# Opraviť DATABASE_URL v .env
sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:/var/www/premarketprice/prisma/data/premarket.db"|' .env

# Alebo ak používate relatívnu cestu:
sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:./prisma/data/premarket.db"|' .env
```

**Možnosť B: Manuálna úprava .env súboru**
```bash
cd /var/www/premarketprice
nano .env
# Alebo
vi .env

# Zmeniť riadok:
# DATABASE_URL="file:/var/www/premarketprice/prisma/data/premarket.db"
# ALEBO
# DATABASE_URL="file:./prisma/data/premarket.db"
```

### 3. Overiť opravu

```bash
# Skontrolovať, či je DATABASE_URL správne nastavený
grep DATABASE_URL .env

# Mali by ste vidieť:
# DATABASE_URL="file:/var/www/premarketprice/prisma/data/premarket.db"
# ALEBO
# DATABASE_URL="file:./prisma/data/premarket.db"
```

### 4. Reštartovať aplikáciu

```bash
# Reštartovať PM2 procesy s novými environment premennými
pm2 restart premarketprice --update-env
pm2 restart pmp-polygon-worker --update-env
pm2 restart pmp-bulk-preloader --update-env

# Skontrolovať logy
pm2 logs premarketprice --lines 20
```

### 5. Overiť, či funguje

```bash
# Skontrolovať health endpoint
curl http://localhost:3000/api/health

# Mali by ste vidieť:
# {"status":"healthy",...}
```

## 📋 Kompletný príkaz (kopírovať a spustiť)

```bash
cd /var/www/premarketprice && \
echo "=== 1. KONTROLA AKTUÁLNEHO DATABASE_URL ===" && \
grep DATABASE_URL .env && \
echo "" && \
echo "=== 2. KONTROLA, ČI EXISTUJE DATABÁZA ===" && \
ls -la prisma/data/premarket.db && \
echo "" && \
echo "=== 3. OPRAVA DATABASE_URL ===" && \
sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:/var/www/premarketprice/prisma/data/premarket.db"|' .env && \
echo "✅ DATABASE_URL opravený" && \
echo "" && \
echo "=== 4. OVERENIE ===" && \
grep DATABASE_URL .env && \
echo "" && \
echo "=== 5. REŠTARTOVANIE APLIKÁCIE ===" && \
pm2 restart premarketprice --update-env && \
pm2 restart pmp-polygon-worker --update-env && \
pm2 restart pmp-bulk-preloader --update-env && \
echo "" && \
echo "=== 6. KONTROLA LOGOV ===" && \
sleep 3 && \
pm2 logs premarketprice --lines 10 --nostream
```

## ⚠️ Poznámky

- **Absolútna cesta** (`file:/var/www/premarketprice/prisma/data/premarket.db`) je odporúčaná pre produkciu
- **Relatívna cesta** (`file:./prisma/data/premarket.db`) funguje, ale musí byť spustená z správneho adresára
- Po zmene `.env` súboru **vždy** použite `--update-env` pri reštarte PM2 procesov
- SQLite URL musí mať **forward slashes** (`/`), nie backslashes (`\`)

