# 🔐 Kompletný návod na nastavenie SSL pre premarketprice.com

## 📋 Prehľad

Tento návod vás prevedie nastavením SSL certifikátov pomocou Let's Encrypt a Certbot pre `premarketprice.com` a `www.premarketprice.com` na serveri `89.185.250.213`.

## ✅ Predpoklady

1. **Server:** Ubuntu/Debian VPS na `89.185.250.213`
2. **Prístup:** SSH ako `root` (nie `sudo`)
3. **Nginx:** Nainštalovaný a bežiaci
4. **DNS:** `premarketprice.com` a `www.premarketprice.com` smerujú na `89.185.250.213`
5. **Porty:** Porty 80 a 443 musia byť otvorené vo firewalle

## 🚀 Rýchly spustiteľný príkaz

```bash
echo "=== 1. Aktualizácia a inštalácia Certbot ===" && apt update && apt install -y certbot python3-certbot-nginx && echo "" && echo "=== 2. Kontrola firewall (porty 80, 443) ===" && ufw allow 80/tcp && ufw allow 443/tcp && ufw reload && echo "" && echo "=== 3. Kontrola DNS ===" && dig premarketprice.com +short && dig www.premarketprice.com +short && echo "" && echo "=== 4. Kontrola Nginx ===" && nginx -t && systemctl status nginx | head -5 && echo "" && echo "=== 5. VYTVORENIE SSL CERTIFIKÁTU ===" && certbot --nginx -d premarketprice.com -d www.premarketprice.com && echo "" && echo "=== 6. Overenie certifikátu ===" && ls -la /etc/letsencrypt/live/premarketprice.com/ && echo "" && echo "=== 7. Reštart Nginx ===" && systemctl restart nginx && echo "" && echo "=== 8. Test SSL ===" && curl -I https://premarketprice.com 2>&1 | head -5 && echo "" && echo "✅ HOTOVO! SSL je nastavený."
```

## 📝 Podrobný postup

### Krok 1: Aktualizácia systému a inštalácia Certbot

```bash
apt update
apt install -y nginx certbot python3-certbot-nginx
```

**Overenie:**
```bash
nginx -v
certbot --version
```

### Krok 2: Kontrola a otvorenie firewall portov

```bash
# Zobraziť stav firewallu
ufw status

# Otvoriť porty pre HTTP a HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Aplikovať zmeny
ufw reload
```

**Dôležité:** Let's Encrypt potrebuje prístup na port 80 pre HTTP-01 challenge!

### Krok 3: Overenie DNS

```bash
# Skontrolovať, či DNS správne smeruje na server
dig premarketprice.com +short
dig www.premarketprice.com +short
```

**Očakávaný výstup:**
```
89.185.250.213
89.185.250.213
```

Ak DNS ešte nepropagoval, počkajte niekoľko minút alebo použite DNS-01 challenge (pozri nižšie).

### Krok 4: Kontrola Nginx

```bash
# Skontrolovať syntax Nginx konfigurácie
nginx -t

# Skontrolovať, či Nginx beží
systemctl status nginx

# Ak nebeží, spustiť:
systemctl start nginx
systemctl enable nginx
```

### Krok 5: Vytvorenie SSL certifikátu

```bash
certbot --nginx -d premarketprice.com -d www.premarketprice.com
```

**Čo sa stane:**
1. Certbot sa prihlási k Let's Encrypt
2. Overí vlastníctvo domény cez HTTP-01 challenge
3. Vygeneruje SSL certifikát
4. Automaticky upraví Nginx konfiguráciu
5. Nastaví automatické obnovovanie certifikátov

**Počas procesu:**
- Certbot sa môže opýtať na e-mail (pre upozornenia)
- Certbot sa môže opýtať, či chcete presmerovať HTTP na HTTPS (odpovedzte **Áno**)

### Krok 6: Overenie certifikátu

```bash
# Skontrolovať, či certifikáty existujú
ls -la /etc/letsencrypt/live/premarketprice.com/

# Mali by ste vidieť:
# - fullchain.pem (certifikát + chain)
# - privkey.pem (súkromný kľúč)
# - cert.pem (certifikát)
# - chain.pem (chain)
```

### Krok 7: Reštart Nginx

```bash
systemctl restart nginx
systemctl status nginx
```

### Krok 8: Test SSL

```bash
# Test HTTPS pripojenia
curl -I https://premarketprice.com
curl -I https://www.premarketprice.com

# Test v prehliadači
# Otvorte: https://premarketprice.com
```

## 🔧 Riešenie problémov

### Problém 1: "Network unreachable" / Firewall blokuje port 80

**Chyba:**
```
Detail: 76.76.19.36: Fetching http://premarketprice.com/.well-known/acme-challenge/...: 
Network unreachable / Timeout during connect (likely firewall problem)
```

**Riešenie:**
```bash
# Otvoriť port 80
ufw allow 80/tcp
ufw reload

# Skontrolovať iptables (ak používate)
iptables -L -n | grep 80
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
```

### Problém 2: DNS ešte nepropagoval

**Riešenie: Použiť DNS-01 challenge**

```bash
# Manuálna DNS challenge (vyžaduje pridané TXT záznamu do DNS)
certbot certonly --manual --preferred-challenges dns -d premarketprice.com -d www.premarketprice.com

# Certbot vám zobrazí TXT záznam, ktorý musíte pridať do DNS:
# _acme-challenge.premarketprice.com TXT "xxxxx"
# Po pridaní stlačte Enter
```

### Problém 3: "duplicate default server" v Nginx

**Chyba:**
```
nginx: [emerg] duplicate default_server
```

**Riešenie:**
```bash
# Nájsť všetky konfiguračné súbory
grep -r "default_server" /etc/nginx/sites-enabled/

# Odstrániť alebo zakomentovať duplicitné default_server
# Alebo odstrániť backup súbory
rm /etc/nginx/sites-enabled/*.backup
```

### Problém 4: Certifikát existuje, ale Nginx ho nepoužíva

**Riešenie:**
```bash
# Skontrolovať Nginx konfiguráciu
grep -r "ssl_certificate" /etc/nginx/

# Ak chýba, pridať do server bloku:
# ssl_certificate /etc/letsencrypt/live/premarketprice.com/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/premarketprice.com/privkey.pem;

# Reštartovať Nginx
systemctl restart nginx
```

### Problém 5: Certbot sa nemôže pripojiť k Let's Encrypt

**Riešenie:**
```bash
# Skontrolovať sieťové pripojenie
ping acme-v02.api.letsencrypt.org

# Skontrolovať DNS
nslookup acme-v02.api.letsencrypt.org

# Použiť staging server (pre testovanie)
certbot --nginx -d premarketprice.com -d www.premarketprice.com --staging
```

## 🔄 Automatické obnovovanie certifikátov

Certbot automaticky nastaví cron job pre obnovovanie certifikátov.

**Manuálne overenie:**
```bash
# Test obnovenia (dry-run)
certbot renew --dry-run

# Skontrolovať cron job
cat /etc/cron.d/certbot
```

**Manuálne obnovenie:**
```bash
certbot renew
systemctl reload nginx
```

## 📊 Overenie SSL certifikátu

### Online nástroje:
- https://www.ssllabs.com/ssltest/analyze.html?d=premarketprice.com
- https://crt.sh/?q=premarketprice.com

### Príkazový riadok:
```bash
# Zobraziť informácie o certifikáte
openssl s_client -connect premarketprice.com:443 -servername premarketprice.com < /dev/null 2>/dev/null | openssl x509 -noout -dates

# Test SSL handshake
openssl s_client -connect premarketprice.com:443 -servername premarketprice.com
```

## ✅ Kontrolný zoznam

- [ ] Nginx je nainštalovaný a beží
- [ ] Certbot je nainštalovaný
- [ ] Porty 80 a 443 sú otvorené vo firewalle
- [ ] DNS správne smeruje na server
- [ ] SSL certifikát je vygenerovaný
- [ ] Nginx používa SSL certifikát
- [ ] HTTPS funguje v prehliadači
- [ ] Automatické obnovovanie je nastavené

## 🎯 Výsledok

Po úspešnom dokončení by ste mali mať:

1. ✅ SSL certifikát pre `premarketprice.com` a `www.premarketprice.com`
2. ✅ HTTPS presmerovanie z HTTP
3. ✅ Automatické obnovovanie certifikátov
4. ✅ Bezpečné HTTPS pripojenie

## 📞 Podpora

Ak máte problémy:
1. Skontrolujte logy: `tail -f /var/log/nginx/error.log`
2. Skontrolujte Certbot logy: `tail -f /var/log/letsencrypt/letsencrypt.log`
3. Overte DNS: `dig premarketprice.com`
4. Skontrolujte firewall: `ufw status`

