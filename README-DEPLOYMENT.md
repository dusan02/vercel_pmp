# Production Deployment Guide

## Automatizované deployment skripty

### 1. **SSH Key Authentication (Odporúčané - najbezpečnejšie)**

Najprv nastavte SSH kľúč:

```bash
# Vygenerujte SSH kľúč (ak ho ešte nemáte)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Skopírujte kľúč na server
ssh-copy-id root@89.185.250.213
```

Potom použite jednoduchý skript:

**Linux/macOS:**
```bash
./deploy-production.sh
```

**Windows (PowerShell):**
```powershell
.\deploy-production.ps1
```

### 2. **Password Authentication (Menej bezpečné)**

**Linux/macOS:**
```bash
# Nainštalujte sshpass (ak nie je nainštalovaný)
sudo apt-get install sshpass  # Ubuntu/Debian
# alebo
brew install hudochenkov/sshpass/sshpass  # macOS

# Spustite deployment s heslom
SSH_PASSWORD="sfdsfae" ./deploy-production.sh
```

**Windows:**
```powershell
# Metóda 1: Použiť plink (PuTTY)
# Stiahnite a nainštalujte PuTTY, potom:
$env:SSH_PASSWORD="sfdsfae"
.\deploy-production-with-password.ps1

# Metóda 2: Použiť WSL alebo Git Bash
# V Git Bash alebo WSL:
SSH_PASSWORD="sfdsfae" ./deploy-production.sh
```

### 3. **Manuálne spustenie**

Ak automatizácia nefunguje, spustite príkazy manuálne:

```bash
ssh root@89.185.250.213
# Zadať heslo: sfdsfae

cd /var/www/premarketprice
git pull origin main
npm ci
npx prisma generate
npm run build
pm2 restart premarketprice --update-env
```

## Čo robia deployment skripty

1. **git pull origin main** - Stiahne najnovšie zmeny z Git
2. **npm ci** - Nainštaluje závislosti (clean install)
3. **npx prisma generate** - Vygeneruje Prisma klienta
4. **npm run build** - Zostaví aplikáciu
5. **pm2 restart premarketprice --update-env** - Reštartuje aplikáciu s novými env premennými

## Bezpečnostné poznámky

⚠️ **Dôležité:**
- Nikdy neukladajte heslo do Git repozitára
- Použite SSH kľúče namiesto hesiel (bezpečnejšie)
- Ak musíte použiť heslo, použite environment premennú: `$env:SSH_PASSWORD` alebo `SSH_PASSWORD`

## Rýchle riešenie pre Windows

Najjednoduchšie riešenie pre Windows je použiť **Git Bash** alebo **WSL**:

1. Otvorte Git Bash alebo WSL
2. Spustite:
   ```bash
   cd /d/Projects/Vercel_PMP/pmp_prod
   SSH_PASSWORD="sfdsfae" ./deploy-production.sh
   ```

Alebo nastavte SSH kľúč a používajte jednoduchý skript bez hesla.
