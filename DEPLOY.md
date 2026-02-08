# 🚀 Rýchle nasadenie PremarketPrice

## Automatizovaný deployment

### Metóda 1: Jednoduchý SSH príkaz (najrýchlejšie)

> **Požiadavka**: používaj **Node.js 20.x** (kvôli stabilným prebuildom pre natívne balíky ako `better-sqlite3`).
> Ak si na serveri na inej verzii, môže `npm ci`/build občas padnúť.

```bash
ssh root@89.185.250.213 "cd /var/www/premarketprice && git pull origin main && npm ci && npx prisma generate && npm run build && pm2 restart premarketprice --update-env"
```

**Alebo s heslom cez sshpass:**
```bash
sshpass -p 'nahodné_heslo123' ssh root@89.185.250.213 "cd /var/www/premarketprice && git pull origin main && npm ci && npx prisma generate && npm run build && pm2 restart premarketprice --update-env"
```

### Metóda 2: Použitie deployment scriptu na serveri

1. **Prihlásenie na server:**
```bash
ssh root@89.185.250.213
# Heslo: nahodné_heslo123
```

2. **Spustenie deployment scriptu:**
```bash
cd /var/www/premarketprice
bash deploy.sh
```

### Metóda 3: PowerShell script (Windows)

```powershell
.\deploy.ps1
```

Alebo s vlastnými parametrami:
```powershell
.\deploy.ps1 -Server "root@89.185.250.213" -Password "nahodné_heslo123"
```

## Manuálny postup (ak potrebujete viac kontroly)

```bash
# 1. Prihlásenie
ssh root@89.185.250.213
# Heslo: nahodné_heslo123

# 2. Prejsť do adresára projektu
cd /var/www/premarketprice

# 3. Stiahnuť najnovšie zmeny
git pull origin main

# 4. Inštalovať závislosti
npm ci

# 5. Generovať Prisma klienta
npx prisma generate

# 6. Build aplikácie
npm run build

# 7. Reštartovať iba web app (minimalizuje 502 počas deployu)
pm2 restart premarketprice --update-env

# 8. Skontrolovať status
pm2 status
pm2 logs --lines 50
```

## Rýchly prompt pre AI/ChatGPT

```
Potrebujem rýchly deployment script pre moju Next.js aplikáciu. 
Postup je:
1. SSH prihlásenie: ssh root@89.185.250.213 (heslo: nahodné_heslo123)
2. cd /var/www/premarketprice
3. git pull origin main
4. npm ci
5. npx prisma generate
6. npm run build
7. pm2 restart all --update-env

Vytvor mi:
- Bash script (deploy.sh) s týmito príkazmi
- PowerShell script (deploy.ps1) pre automatizáciu SSH z Windows
- Jednoduchý SSH one-liner príkaz
- Dokumentáciu s rôznymi metódami deploymentu
```

## Kontrola po nasadení

```bash
# Status PM2 procesov
pm2 status

# Logy aplikácie
pm2 logs --lines 100

# Kontrola portov
netstat -tlnp | grep -E '3000|443|80'

# Test API endpointu
curl http://localhost:3000/api/health
```

## Riešenie problémov

### Ak build zlyhá:
```bash
# Vyčistiť cache
rm -rf .next node_modules/.cache
npm ci
npm run build
```

### Ak PM2 nefunguje:
```bash
# Zastaviť všetko
pm2 stop all
pm2 delete all

# Spustiť znova
pm2 start ecosystem.config.js --env production
pm2 save
```

### Ak Prisma zlyhá:
```bash
npx prisma generate --force
npx prisma db push  # ak sú zmeny v schéme
```

## Bezpečnosť

⚠️ **Dôležité:** Pre produkciu odporúčame:
1. Použiť SSH kľúče namiesto hesla
2. Uložiť heslo do environment variables, nie do scriptu
3. Použiť CI/CD pipeline (GitHub Actions, GitLab CI, atď.)

### Nastavenie SSH kľúčov:
```bash
# Na lokálnom počítači
ssh-keygen -t ed25519 -C "deployment"
ssh-copy-id root@89.185.250.213

# Potom môžete používať bez hesla
ssh root@89.185.250.213
```

## CI/CD integrácia

Pre automatizáciu môžete pridať GitHub Actions workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: 89.185.250.213
          username: root
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/premarketprice
            git pull origin main
            npm ci
            npx prisma generate
            npm run build
            pm2 restart all --update-env
```
