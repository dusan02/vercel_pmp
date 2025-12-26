# 🔧 Oprava Git Pull na SSH Serveri

## Problém
Git pull zlyháva kvôli lokálnym zmenám v `prisma/data/premarket.db` (databázový súbor).

## Riešenie

### Krok 1: Stash alebo Reset Databázového Súboru

**Možnosť A: Stash zmeny (odporúčané)**
```bash
cd /var/www/premarketprice
git stash
git pull origin main
git stash pop  # Ak chcete obnoviť zmeny (alebo git stash drop ak ich nechcete)
```

**Možnosť B: Reset databázového súboru (ak nepotrebujete lokálne zmeny)**
```bash
cd /var/www/premarketprice
git checkout -- prisma/data/premarket.db
git pull origin main
```

**Možnosť C: Force pull (ignoruje lokálne zmeny v DB)**
```bash
cd /var/www/premarketprice
git reset --hard origin/main
git pull origin main
```

### Krok 2: Skontrolujte, Prečo Server Nebeží

```bash
# Skontrolujte PM2 status
pm2 status

# Skontrolujte logy premarketprice procesu
pm2 logs premarketprice --lines 50 --nostream

# Skontrolujte, či port 3000 je obsadený
netstat -tuln | grep 3000

# Alebo
lsof -i :3000
```

### Krok 3: Reštartujte Server

```bash
cd /var/www/premarketprice
pm2 restart ecosystem.config.js --update-env

# Počkať 10 sekúnd
sleep 10

# Skontrolujte health check
curl http://localhost:3000/api/health
```

### Krok 4: Test OAuth Endpoints

```bash
# Test config-check endpoint
curl http://localhost:3000/api/config-check

# Test providers endpoint
curl http://localhost:3000/api/auth/providers
```

## Poznámka

Databázový súbor `prisma/data/premarket.db` by nemal byť v gite. Po úspešnom git pull by mal byť pridaný do `.gitignore` a odstránený z gitu.

