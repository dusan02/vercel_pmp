# Fix Git Pull Conflict on SSH Server

## Problém
Git pull zlyhá kvôli lokálnym zmenám v súboroch, ktoré by nemali byť v gite:
- `next-env.d.ts` (build artifact)
- `prisma/data/premarket.db` (databáza)

## Riešenie - Príkazy pre SSH

### Možnosť 1: Reset lokálnych zmien (odporúčané)

```bash
cd /var/www/premarketprice

# 1. Zrušiť lokálne zmeny v týchto súboroch
git checkout -- next-env.d.ts
git checkout -- prisma/data/premarket.db

# 2. Stiahnuť zmeny
git pull origin main

# 3. Reštartovať aplikáciu
pm2 restart premarketprice
pm2 status
```

### Možnosť 2: Stash lokálnych zmien

```bash
cd /var/www/premarketprice

# 1. Uložiť lokálne zmeny do stash
git stash

# 2. Stiahnuť zmeny
git pull origin main

# 3. Reštartovať aplikáciu
pm2 restart premarketprice
pm2 status
```

### Možnosť 3: Hard reset (ak nepotrebuješ lokálne zmeny)

```bash
cd /var/www/premarketprice

# 1. Reset na remote verziu (strácaš lokálne zmeny)
git fetch origin
git reset --hard origin/main

# 2. Reštartovať aplikáciu
pm2 restart premarketprice
pm2 status
```

### Kompletný príkaz (Možnosť 1 - najbezpečnejšia)

```bash
cd /var/www/premarketprice && git checkout -- next-env.d.ts prisma/data/premarket.db && git pull origin main && pm2 restart premarketprice && pm2 status
```

## Overenie, že súbory sú v .gitignore

Tieto súbory by mali byť v `.gitignore`:
- `next-env.d.ts` - Next.js build artifact
- `prisma/data/*.db` - SQLite databázy

Ak nie sú, pridaj ich do `.gitignore` na lokálnom počítači a commitni.

