# 🔍 Diagnostika a oprava 502 Bad Gateway

## Príčina
502 Bad Gateway znamená, že Next.js aplikácia na serveri nebeží alebo je nedostupná. Pravdepodobne kvôli TypeScript chybe pri build-e.

## 📋 Diagnostické príkazy (spustiť na SSH serveri)

```bash
# 1. Prejsť do projektu
cd /var/www/premarketprice

# 2. Skontrolovať PM2 status
pm2 status

# 3. Skontrolovať logy premarketprice procesu
pm2 logs premarketprice --lines 50 --err

# 4. Skontrolovať, či beží na porte 3000
ss -tlnp | grep 3000

# 5. Skontrolovať, či existuje .next adresár (build output)
ls -la .next/

# 6. Skontrolovať posledné zmeny v git
git log --oneline -5
```

## 🔧 Oprava (spustiť na SSH serveri)

```bash
# 1. Prejsť do projektu
cd /var/www/premarketprice

# 2. Stiahnuť najnovšiu opravu (TypeScript fix)
git pull origin main

# 3. Skontrolovať, či build prebehne úspešne
npm run build

# 4. Ak build prebehol úspešne, restartovať aplikáciu
pm2 restart premarketprice

# 5. Počkať 10 sekúnd a skontrolovať logy
sleep 10
pm2 logs premarketprice --lines 20

# 6. Skontrolovať status
pm2 status

# 7. Skontrolovať, či beží na porte 3000
ss -tlnp | grep 3000

# 8. Uložiť PM2 konfiguráciu
pm2 save
```

## ⚠️ Ak build stále zlyhá

```bash
# 1. Skontrolovať TypeScript chyby
npm run build 2>&1 | grep -A 10 "Type error"

# 2. Skontrolovať, či sú všetky súbory aktualizované
git status

# 3. Ak sú lokálne zmeny, ktoré blokujú pull:
git stash
git pull origin main
git stash pop

# 4. Alebo resetovať lokálne zmeny (POZOR: stratíte lokálne zmeny)
git reset --hard HEAD
git pull origin main
```

## 🚨 Ak aplikácia stále nebeží

```bash
# 1. Zastaviť a vymazať proces
pm2 stop premarketprice
pm2 delete premarketprice

# 2. Skontrolovať, či nie je problém s portom
lsof -i :3000
# Alebo
netstat -tlnp | grep 3000

# 3. Ak port je obsadený, nájsť a zastaviť proces
# (použiť PID z predchádzajúceho príkazu)
# kill -9 <PID>

# 4. Spustiť aplikáciu znovu
pm2 start ecosystem.config.js --only premarketprice --env production

# 5. Skontrolovať logy
pm2 logs premarketprice --lines 30

# 6. Mali by ste vidieť:
# 🚀 Next.js server ready on http://localhost:3000
```

## ✅ Očakávaný výsledok

Po úspešnej oprave by ste mali vidieť:
- `pm2 status` ukazuje `premarketprice` ako `online`
- `ss -tlnp | grep 3000` ukazuje, že port 3000 je otvorený
- `pm2 logs premarketprice` ukazuje "🚀 Next.js server ready"
- Web stránka https://premarketprice.com/ funguje bez 502 chyby

