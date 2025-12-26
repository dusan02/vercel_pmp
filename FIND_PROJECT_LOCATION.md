# 🔍 Nájdenie umiestnenia projektu na serveri

## Problém
Adresár `/var/www/premarketprice/pmp_prod` neexistuje na serveri.

## Riešenie - nájsť skutočné umiestnenie

### Krok 1: Skontrolovať, kde bol starý PM2 proces spustený

```bash
# Zobraziť detailné informácie o starom procese (ak ešte existuje v PM2)
pm2 describe premarketprice

# Alebo skontrolovať PM2 dump súbor
cat /root/.pm2/dump.pm2 | grep -A 10 premarketprice
```

### Krok 2: Hľadať projekt na serveri

```bash
# Hľadať adresár s názvom "premarketprice"
find / -type d -name "*premarketprice*" 2>/dev/null

# Hľadať adresár s názvom "pmp"
find / -type d -name "*pmp*" 2>/dev/null

# Hľadať súbor ecosystem.config.js
find / -name "ecosystem.config.js" 2>/dev/null

# Hľadať súbor server.ts
find / -name "server.ts" 2>/dev/null | grep -v node_modules

# Hľadať package.json
find / -name "package.json" 2>/dev/null | grep -E "(premarket|pmp)" | head -5
```

### Krok 3: Skontrolovať bežné umiestnenia

```bash
# Skontrolovať bežné webové adresáre
ls -la /var/www/
ls -la /srv/
ls -la /home/
ls -la /opt/
ls -la /usr/local/

# Skontrolovať, kde bežia earnings procesy (môžu byť v tom istom adresári)
pm2 describe earnings-table
# Pozrieť sa na "cwd" (current working directory)
```

### Krok 4: Skontrolovať PM2 logy pre cesty

```bash
# Skontrolovať logy pre cesty k súborom
pm2 logs premarketprice --lines 100 | grep -E "(path|directory|cwd|/var|/srv|/home)"
```

## Možné umiestnenia

Projekt môže byť na jednom z týchto miest:

1. `/srv/premarketprice/` - bežné pre Debian/Ubuntu
2. `/home/root/premarketprice/` - home adresár root používateľa
3. `/opt/premarketprice/` - opt adresár
4. `/var/www/html/` - štandardný web root
5. `/var/www/premarketprice/` - bez `pmp_prod` podadresára
6. `/root/premarketprice/` - root home adresár

## Po nájdení projektu

Keď nájdete správne umiestnenie, aktualizujte `ecosystem.config.js`:

```javascript
cwd: "/skutočna/cesta/k/projektu",
```

A potom spustite:

```bash
cd /skutočna/cesta/k/projektu
pm2 start ecosystem.config.js --env production
```

