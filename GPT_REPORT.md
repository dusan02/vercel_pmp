# 📊 Report o migrácii PremarketPrice na VPS - Pre GPT

## 🎯 Cieľ migrácie
Migrácia PremarketPrice z Vercel na vlastný VPS server (89.185.250.213) s podporou pre dve domény:
- `premarketprice.com`
- `earningstable.com`

## ✅ ČO SA PODARILO

### 1. Server Infrastructure
- ✅ **Next.js server beží na porte 3000** (pôvodne bežal na 3001, opravené hardcode portom v `server.ts`)
- ✅ **WebSocket server funguje** na porte 3000
- ✅ **Health endpoint funguje** - `/api/health` vracia správne JSON dáta
- ✅ **Priame pripojenie na port 3000 funguje** - `curl http://localhost:3000/api/health` vracia dáta

### 2. PM2 Konfigurácia
- ✅ **ecosystem.config.js opravený:**
  - Zmenený `exec_mode` z `cluster` na `fork` (kvôli problémom s environment premennými)
  - Zmenený `instances` z `max` na `1`
  - Správna cesta: `/var/www/premarketprice` (nie `pmp_prod` podadresár)
  - Interpreter: `npx tsx` (správne pre TypeScript súbory)
  - Environment premenné: `PORT: 3000`, `NODE_ENV: production`, `ENABLE_WEBSOCKET: true`

### 3. Nginx Konfigurácia
- ✅ **nginx.conf syntakticky správny** - `nginx -t` vracia OK
- ✅ **Upstream smeruje na `127.0.0.1:3000`** (opravené z Vercel adries)
- ✅ **HTTP presmerováva na HTTPS** (301 redirect)
- ✅ **HTTPS bloky sú nakonfigurované** pre obe domény
- ✅ **WebSocket support** je nakonfigurovaný

### 4. SSL Certifikáty
- ✅ **earningstable.com má SSL certifikát** - úspešne obnovený, expiruje 2026-03-24
- ❌ **premarketprice.com nemá SSL certifikát** - Let's Encrypt zlyhá kvôli firewall problému

### 5. Kódové zmeny
- ✅ **server.ts** - port hardcoded na 3000 (dočasné riešenie, pretože PM2 nečítal environment premenné správne)
- ✅ **ecosystem.config.js** - všetky cesty opravené na `/var/www/premarketprice`
- ✅ **nginx.conf** - upstream zmenený na lokálny server, pridaná podpora pre obe domény

## ❌ ČO EŠTE NEFUNGUJE

### 1. SSL Certifikát pre premarketprice.com (KRITICKÉ)
**Status:** ❌ Zlyhá

**Problém:**
Let's Encrypt HTTP-01 challenge zlyhá s chybami:
- `Network unreachable` alebo `Timeout during connect (likely firewall problem)`
- Let's Encrypt server (76.76.19.36) sa nemôže pripojiť na port 80

**Pokusy o riešenie:**
1. ❌ UFW firewall - nie je nainštalovaný (`ufw: command not found`)
2. ❌ iptables - pravidlá pridané, ale stále zlyhá (`Network unreachable`)
3. ❌ DNS-01 challenge - TXT záznamy neboli pridané do DNS alebo ešte nie sú propagované

**Možné príčiny:**
- Firewall na VPS poskytovateľovi (Hetzner/DigitalOcean) blokuje port 80
- Cloud firewall/security group blokuje prichádzajúce spojenia na port 80
- Nginx nie je správne nakonfigurovaný pre HTTP challenge

**Riešenia:**
1. Skontrolovať cloud firewall v poskytovateľskom paneli
2. Použiť DNS-01 challenge (vyžaduje manuálne pridanie TXT záznamov)
3. Dočasne vypnúť HTTPS redirect a používať len HTTP

### 2. Workers (NÍZKA PRIORITA)
- ❌ `pmp-polygon-worker` - ešte nie je spustený
- ❌ `pmp-bulk-preloader` - ešte nie je spustený

**Poznámka:** Workers nie sú kritické pre základnú funkcionalitu, môžu byť spustené neskôr.

### 3. Nginx Konfigurácia Aktualizácia
- ⚠️ Náš `nginx.conf` je v `/var/www/premarketprice/nginx.conf`
- ⚠️ Nginx môže používať `/etc/nginx/nginx.conf` alebo `/etc/nginx/sites-enabled/`
- ⚠️ Treba skontrolovať, či Nginx používa našu konfiguráciu

## 🔧 TECHNICKÉ DETAILY

### Server Setup
- **OS:** Debian 6.1.0-40-amd64
- **IP:** 89.185.250.213
- **Cesta k projektu:** `/var/www/premarketprice`
- **Node.js:** Verzia 20 (z NodeSource)
- **PM2:** Verzia 2.1.0 (staršia, odporúča sa upgrade na 6.0.14)

### Porty
- **3000:** Next.js server (funguje ✅)
- **80:** HTTP (Nginx) - presmerováva na HTTPS
- **443:** HTTPS (Nginx) - blokované kvôli chýbajúcemu SSL certifikátu

### Environment Premenné
- `.env` súbor vytvorený s `PORT=3000`, `NODE_ENV=production`, `ENABLE_WEBSOCKET=true`
- PM2 environment premenné v `ecosystem.config.js` - `PORT: 3000`
- **Problém:** PM2 v cluster mode nečítal environment premenné správne → riešené zmenou na fork mode a hardcode portom

### Firewall
- UFW nie je nainštalovaný
- iptables pravidlá pridané pre porty 80 a 443
- Stále zlyhá - pravdepodobne cloud firewall blokuje

## 📋 SÚHRN PROBLÉMOV

| Problém | Priorita | Status | Riešenie |
|---------|----------|--------|----------|
| SSL certifikát premarketprice.com | VYSOKÁ | ❌ Zlyhá | Cloud firewall alebo DNS-01 challenge |
| Workers | NÍZKA | ⏳ Čaká | Spustiť neskôr |
| Nginx konfigurácia | STREDNÁ | ⚠️ Skontrolovať | Overiť, či používa správnu konfiguráciu |

## 🎯 ĎALŠIE KROKY

### Priorita 1: SSL Certifikát
1. Skontrolovať cloud firewall v poskytovateľskom paneli (Hetzner/DigitalOcean)
2. Otvoriť porty 80 a 443 v cloud firewall
3. Skúsiť znovu: `certbot certonly --nginx -d premarketprice.com -d www.premarketprice.com`
4. Alebo použiť DNS-01 challenge s manuálnym pridaním TXT záznamov

### Priorita 2: Overenie Nginx
1. Skontrolovať, ktorú konfiguráciu Nginx používa: `nginx -T`
2. Skontrolovať, či používa našu konfiguráciu alebo `/etc/nginx/`
3. Ak nie, skopírovať našu konfiguráciu do správneho miesta

### Priorita 3: Workers
1. Spustiť: `pm2 start ecosystem.config.js --only pmp-polygon-worker --env production`
2. Spustiť: `pm2 start ecosystem.config.js --only pmp-bulk-preloader --env production`
3. Uložiť: `pm2 save`

## 📝 DÔLEŽITÉ POZNÁMKY

1. **Port 3000 vs 3001:** Pôvodne server bežal na 3001, opravené hardcode portom 3000 v `server.ts`. Ideálne by bolo riešiť, prečo PM2 nečítal environment premenné, ale hardcode riešenie funguje.

2. **Cluster vs Fork mode:** PM2 cluster mode mal problémy s environment premennými, zmenené na fork mode.

3. **Firewall:** Problém nie je v lokálnom firewalli (iptables), ale pravdepodobne v cloud firewalli poskytovateľa.

4. **DNS:** Obe domény smerujú na rovnakú IP adresu (89.185.250.213), čo je správne. Nginx rozlišuje domény podľa `server_name` direktívy.

5. **SSL Certifikáty:** earningstable.com má certifikát, premarketprice.com nie. Obe domény potrebujú vlastné certifikáty.

## 🔍 DIAGNOSTIKA

### Testy, ktoré fungujú:
- ✅ `curl http://localhost:3000/api/health` - vracia JSON
- ✅ `ss -tlnp | grep 3000` - port 3000 je otvorený
- ✅ `nginx -t` - konfigurácia je OK
- ✅ `pm2 status` - server beží

### Testy, ktoré zlyhávajú:
- ❌ `certbot certonly --nginx -d premarketprice.com` - Network unreachable
- ❌ `curl https://premarketprice.com` - 502 Bad Gateway (kvôli chýbajúcemu certifikátu)

## 💡 ODORÚČANIA

1. **Okamžite:** Skontrolovať cloud firewall v poskytovateľskom paneli a otvoriť porty 80/443
2. **Krátkodobo:** Použiť DNS-01 challenge, ak cloud firewall nie je možné zmeniť
3. **Dlhodobo:** Opraviť environment premenné v PM2 (namiesto hardcode portu)
4. **Dlhodobo:** Upgrade PM2 na najnovšiu verziu (6.0.14)

## 📊 PROGRESS

**Celkový progress:** ~85%
- ✅ Server setup: 100%
- ✅ PM2 konfigurácia: 100%
- ✅ Nginx konfigurácia: 90% (treba overiť aktívnu konfiguráciu)
- ❌ SSL certifikáty: 50% (1 z 2 domén funguje)
- ⏳ Workers: 0% (nie sú kritické)

**Blokátor:** SSL certifikát pre premarketprice.com - firewall problém

