# 🚀 NASADENIE TERAZ - Správna cesta nájdená!

## ✅ Nájdené umiestnenie projektu

Z terminálu vyplýva, že projekt je na:
```
/var/www/premarketprice/
```

**NIE** `/var/www/premarketprice/pmp_prod/` - projekt je priamo v `/var/www/premarketprice/`

## 📋 Postup nasadenia (kopírovať a spustiť)

```bash
# 1. Pripojiť sa na server
ssh root@89.185.250.213

# 2. Prejsť do správneho adresára
cd /var/www/premarketprice

# 3. Skontrolovať, či existujú súbory
ls -la ecosystem.config.js
ls -la server.ts
ls -la package.json

# 4. Aktualizovať kód (ak používate git)
# git pull origin main

# 5. Inštalovať závislosti (ak boli pridané nové)
npm install

# 6. Generovať Prisma klienta
npx prisma generate

# 7. Build aplikácie
npm run build

# 8. Zastaviť staré procesy
pm2 stop premarketprice
pm2 delete premarketprice

# 9. Spustiť nové procesy s novou konfiguráciou
pm2 start ecosystem.config.js --env production

# 10. Uložiť PM2 konfiguráciu
pm2 save

# 11. Skontrolovať status
pm2 status
pm2 logs premarketprice --lines 20
```

## 🔍 Kontrola, či všetko funguje

```bash
# Skontrolovať, či server beží na porte 3000
netstat -tlnp | grep 3000
# Alebo
ss -tlnp | grep 3000

# Skontrolovať logy
pm2 logs premarketprice --lines 30

# Mali by ste vidieť:
# 🚀 Next.js server ready on http://localhost:3000
# 🔌 WebSocket server ready on ws://localhost:3000
```

## ⚠️ Dôležité poznámky

1. **Cesta v ecosystem.config.js:** Musí byť `cwd: "/var/www/premarketprice"` (nie `pmp_prod`)
2. **Port:** Server musí bežať na porte `3000` (nie 3001)
3. **Bez sudo:** Ste root, takže nepoužívajte `sudo`

## 🔧 Ak niečo nefunguje

```bash
# Skontrolovať, či bežia všetky procesy
pm2 status

# Mali by ste vidieť:
# - premarketprice (online)
# - pmp-polygon-worker (online)
# - pmp-bulk-preloader (online alebo waiting)

# Skontrolovať chyby
pm2 logs premarketprice --err --lines 50

# Reštartovať ak je potrebné
pm2 restart premarketprice
```

