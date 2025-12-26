# 🔧 Oprava portu 3001 → 3000

## Problém
Server beží na porte **3001** namiesto **3000**:
```
🚀 Next.js server ready on http://localhost:3001
```

Ale Nginx očakáva port **3000** (podľa `nginx.conf`).

## ⚡ Rýchle riešenie

### Krok 1: Skontrolovať .env súbor na serveri

```bash
cd /var/www/premarketprice
cat .env | grep PORT
```

### Krok 2: Opraviť PORT v .env

Ak je tam `PORT=3001`, zmeňte na `PORT=3000`:

```bash
# Možnosť A: Upraviť .env súbor
nano .env
# Alebo
vi .env
# Zmeniť PORT=3001 na PORT=3000 alebo odstrániť riadok úplne

# Možnosť B: Použiť sed (rýchlejšie)
sed -i 's/PORT=3001/PORT=3000/g' .env
# Alebo odstrániť riadok úplne
sed -i '/^PORT=3001/d' .env
```

### Krok 3: Reštartovať PM2 proces s novými environment premennými

```bash
# Reštartovať s aktualizáciou environment premenných
pm2 restart premarketprice --update-env

# Alebo zastaviť a spustiť znovu
pm2 stop premarketprice
pm2 delete premarketprice
pm2 start ecosystem.config.js --env production
pm2 save
```

### Krok 4: Skontrolovať, či beží na porte 3000

```bash
# Skontrolovať logy
pm2 logs premarketprice --lines 10

# Mali by ste vidieť:
# 🚀 Next.js server ready on http://localhost:3000

# Skontrolovať porty
netstat -tlnp | grep 3000
# Alebo
ss -tlnp | grep 3000

# Mali by ste vidieť: 127.0.0.1:3000
```

## 🔍 Ak PORT nie je v .env

Ak `.env` súbor neexistuje alebo neobsahuje PORT, problém môže byť:

1. **PM2 nečítá environment premenné správne** - skúste explicitne nastaviť:
   ```bash
   pm2 restart premarketprice --update-env
   ```

2. **Next.js má default port 3000, ale niečo ho mení** - skontrolovať `next.config.ts`:
   ```bash
   cat next.config.ts | grep -i port
   ```

3. **Hardcoded port niekde v kóde** - už sme skontrolovali `server.ts`, tam je správne `process.env.PORT || '3000'`

## ✅ Očakávaný výsledok

Po oprave by ste mali vidieť v logoch:
```
🚀 Next.js server ready on http://localhost:3000
🔌 WebSocket server ready on ws://localhost:3000
```

A port 3000 by mal byť otvorený:
```bash
netstat -tlnp | grep 3000
# 127.0.0.1:3000
```

## 🆘 Ak to stále nefunguje

1. **Skontrolovať PM2 environment premenné:**
   ```bash
   pm2 describe premarketprice | grep -A 20 "env:"
   ```

2. **Skontrolovať, či PM2 používa správnu konfiguráciu:**
   ```bash
   pm2 describe premarketprice | grep -E "(cwd|script|interpreter)"
   ```

3. **Manuálne nastaviť PORT pri spustení:**
   ```bash
   pm2 stop premarketprice
   pm2 delete premarketprice
   PORT=3000 pm2 start ecosystem.config.js --env production
   pm2 save
   ```

