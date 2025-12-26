# 🔧 Oprava ecosystem.config.js - Načítanie DATABASE_URL z .env

## ⚠️ Problém
PM2 procesy nečítajú `DATABASE_URL` z `.env` súboru, pretože `ecosystem.config.js` ho explicitne nenastavuje.

## 🚀 Riešenie

### Krok 1: Upload opraveného ecosystem.config.js

Najprv musíte uploadnúť opravený `ecosystem.config.js` na server. Buď:
- Commitnúť a pushnúť na GitHub, potom `git pull` na serveri
- Alebo skopírovať obsah súboru priamo na server

### Krok 2: Reštartovať procesy

```bash
cd /var/www/premarketprice

# 1. Zastaviť všetky procesy
pm2 stop all
pm2 delete all

# 2. Spustiť procesy znovu s novou konfiguráciou
pm2 start ecosystem.config.js --env production
pm2 save

# 3. Počkať na spustenie
sleep 10

# 4. Skontrolovať status
pm2 status

# 5. Skontrolovať logy
pm2 logs premarketprice --lines 20 --nostream

# 6. Skontrolovať health
curl http://localhost:3000/api/health
```

## 📋 Kompletný príkaz (ak už máte opravený ecosystem.config.js na serveri)

```bash
cd /var/www/premarketprice && \
echo "=== 1. KONTROLA DATABASE_URL V .env ===" && \
grep DATABASE_URL .env && \
echo "" && \
echo "=== 2. ZASTAVENIE PROCESOV ===" && \
pm2 stop all && \
pm2 delete all && \
echo "" && \
echo "=== 3. SPUSTENIE PROCESOV ===" && \
pm2 start ecosystem.config.js --env production && \
pm2 save && \
echo "" && \
echo "=== 4. ČAKANIE NA SPUSTENIE (10 sekúnd) ===" && \
sleep 10 && \
echo "" && \
echo "=== 5. KONTROLA STATUSU ===" && \
pm2 status && \
echo "" && \
echo "=== 6. KONTROLA LOGOV ===" && \
pm2 logs premarketprice --lines 20 --nostream && \
echo "" && \
echo "=== 7. KONTROLA HEALTH ===" && \
curl http://localhost:3000/api/health
```

## 🔍 Alternatíva: Manuálna úprava ecosystem.config.js na serveri

Ak nemôžete uploadnúť súbor, môžete ho upraviť priamo na serveri:

```bash
cd /var/www/premarketprice

# 1. Vytvoriť zálohu
cp ecosystem.config.js ecosystem.config.js.backup

# 2. Upraviť súbor (použite nano alebo vi)
nano ecosystem.config.js

# 3. Pridať na začiatok súboru (pred `module.exports = {`):
# // Load environment variables from .env file manually
# const fs = require('fs');
# const path = require('path');
# const envPath = path.join(__dirname, '.env');
# const envVars = {};
# 
# if (fs.existsSync(envPath)) {
#   const envContent = fs.readFileSync(envPath, 'utf8');
#   envContent.split('\n').forEach(line => {
#     const trimmedLine = line.trim();
#     if (trimmedLine && !trimmedLine.startsWith('#')) {
#       const [key, ...valueParts] = trimmedLine.split('=');
#       if (key && valueParts.length > 0) {
#         let value = valueParts.join('=');
#         // Remove quotes if present
#         if ((value.startsWith('"') && value.endsWith('"')) || 
#             (value.startsWith("'") && value.endsWith("'"))) {
#           value = value.slice(1, -1);
#         }
#         envVars[key.trim()] = value.trim();
#       }
#     }
#   });
# }

# 4. Pridať `DATABASE_URL: envVars.DATABASE_URL || process.env.DATABASE_URL,` do každého `env_production` objektu
```

## ⚠️ Poznámky

- Po úprave `ecosystem.config.js` **vždy** zastavte a zmazať procesy pred novým spustením
- Použite `--env production` pri spustení
- Počkať aspoň 10 sekúnd po spustení pred kontrolou

