# 🔧 Kompletná oprava DATABASE_URL

## ⚠️ Problém
Aj po oprave DATABASE_URL stále vidíme chyby. Možné príčiny:
1. Prisma Client nie je regenerovaný
2. PM2 procesy ešte neprečítali nové environment premenné
3. Server sa ešte nespustil úplne

## 🚀 Kompletné riešenie

### Krok 1: Zastaviť všetky procesy

```bash
cd /var/www/premarketprice

# Zastaviť všetky PM2 procesy
pm2 stop all
pm2 delete all
```

### Krok 2: Overiť DATABASE_URL

```bash
# Skontrolovať, či je DATABASE_URL správne nastavený
grep DATABASE_URL .env

# Mali by ste vidieť:
# DATABASE_URL="file:/var/www/premarketprice/prisma/data/premarket.db"
```

### Krok 3: Regenerovať Prisma Client

```bash
# Regenerovať Prisma Client s novým DATABASE_URL
npx prisma generate
```

### Krok 4: Spustiť procesy znovu

```bash
# Spustiť procesy z ecosystem.config.js
pm2 start ecosystem.config.js --env production

# Uložiť PM2 konfiguráciu
pm2 save
```

### Krok 5: Počkať a skontrolovať

```bash
# Počkať 10 sekúnd na úplné spustenie
sleep 10

# Skontrolovať status
pm2 status

# Skontrolovať logy
pm2 logs premarketprice --lines 20 --nostream

# Skontrolovať health
curl http://localhost:3000/api/health
```

## 📋 Jeden kompletný príkaz (kopírovať a spustiť)

```bash
cd /var/www/premarketprice && \
echo "=== 1. KONTROLA DATABASE_URL ===" && \
grep DATABASE_URL .env && \
echo "" && \
echo "=== 2. ZASTAVENIE VŠETKÝCH PROCESOV ===" && \
pm2 stop all && \
pm2 delete all && \
echo "" && \
echo "=== 3. REGENEROVANIE PRISMA CLIENT ===" && \
npx prisma generate && \
echo "" && \
echo "=== 4. SPUSTENIE PROCESOV ===" && \
pm2 start ecosystem.config.js --env production && \
pm2 save && \
echo "" && \
echo "=== 5. ČAKANIE NA SPUSTENIE (10 sekúnd) ===" && \
sleep 10 && \
echo "" && \
echo "=== 6. KONTROLA STATUSU ===" && \
pm2 status && \
echo "" && \
echo "=== 7. KONTROLA LOGOV ===" && \
pm2 logs premarketprice --lines 20 --nostream && \
echo "" && \
echo "=== 8. KONTROLA HEALTH ===" && \
curl http://localhost:3000/api/health
```

## 🔍 Alternatíva: Ak stále nefunguje

Ak problém pretrváva, skontrolujte:

```bash
# 1. Skontrolovať, či existuje databázový súbor
ls -la prisma/data/premarket.db

# 2. Skontrolovať oprávnenia
chmod 644 prisma/data/premarket.db
chmod 755 prisma/data

# 3. Skontrolovať, či .env súbor je správne naformátovaný
cat .env | grep DATABASE_URL

# 4. Skontrolovať, či nie sú duplicitné DATABASE_URL riadky
grep -n DATABASE_URL .env

# 5. Ak sú duplicitné, odstrániť staré
# (manuálne upraviť .env súbor)
```

## ⚠️ Poznámky

- **Vždy** regenerujte Prisma Client po zmene DATABASE_URL
- **Vždy** použite `--env production` pri spustení PM2 procesov
- **Počkať** aspoň 10 sekúnd po spustení pred kontrolou
- **Zastaviť a zmazať** procesy pred novým spustením zabezpečí čisté načítanie environment premenných

