# ✅ Kontrola stavu servera po deploymente

## 🔍 Overenie, či server beží

```bash
# 1. Skontrolovať PM2 status
pm2 status

# 2. Počkať 10-15 sekúnd a skúsiť health check znova
sleep 10
curl http://localhost:3000/api/health

# 3. Skontrolovať, či server beží na porte 3000
netstat -tuln | grep 3000
# Alebo
ss -tuln | grep 3000

# 4. Skontrolovať najnovšie logy
pm2 logs premarketprice --lines 30 --nostream

# 5. Skontrolovať, či nie sú chyby
pm2 logs premarketprice --err --lines 20 --nostream
```

## 📊 Očakávaný výstup

**PM2 Status:**
- Všetky procesy by mali byť `online`
- `premarketprice` by mal mať status `online`

**Health Check:**
```json
{
  "status": "healthy" | "degraded",
  "database": { "status": "healthy" },
  "redis": { "status": "unhealthy" } // OK, ak Redis nie je nakonfigurovaný
}
```

**Logy:**
- `🚀 Next.js server ready on http://localhost:3000`
- `🔌 WebSocket server ready on ws://localhost:3000`
- `✅ Sector/industry verification completed`

## ⚠️ Ak server nebeží

```bash
# 1. Skontrolovať logy pre chyby
pm2 logs premarketprice --err --lines 50

# 2. Reštartovať proces
pm2 restart premarketprice

# 3. Skontrolovať, či port 3000 nie je obsadený
lsof -i :3000
# Alebo
netstat -tuln | grep 3000

# 4. Skontrolovať environment premenné
cd /var/www/premarketprice
cat .env | grep -E "PORT|DATABASE_URL|NODE_ENV"
```

