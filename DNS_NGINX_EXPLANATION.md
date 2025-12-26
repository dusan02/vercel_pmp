# 🌐 Ako DNS a Nginx rozlišujú domény s rovnakou IP adresou

## 📋 Prehľad problému

Máte dve domény (`premarketprice.com` a `earningstable.com`), ktoré obe smerujú na rovnakú IP adresu `89.185.250.213`. Toto je úplne normálne a bežné - jeden server môže obsluhovať viacero domén.

## 🔍 Ako to funguje?

### 1. DNS (Domain Name System)

**DNS rozlišuje domény podľa názvu, nie podľa IP adresy.**

Keď používateľ zadá do prehliadača:
- `premarketprice.com` → DNS server vráti IP: `89.185.250.213`
- `earningstable.com` → DNS server vráti IP: `89.185.250.213`

**DNS záznamy (A records):**
```
premarketprice.com    A    89.185.250.213
earningstable.com     A    89.185.250.213
```

Obe domény môžu mať rovnakú IP adresu - to nie je problém!

### 2. HTTP/HTTPS Protokol

Keď prehliadač vytvorí HTTP požiadavku, pošle hlavičku `Host`, ktorá obsahuje názov domény:

```
GET / HTTP/1.1
Host: premarketprice.com
...
```

alebo

```
GET / HTTP/1.1
Host: earningstable.com
...
```

### 3. Nginx Server Name Matching

**Nginx rozlišuje domény podľa hlavičky `Host` v HTTP požiadavke.**

V `nginx.conf` máte definované `server_name` pre každú doménu:

```nginx
server {
    listen 443 ssl http2;
    server_name premarketprice.com www.premarketprice.com;
    # ... konfigurácia pre premarketprice
}

server {
    listen 443 ssl http2;
    server_name earningstable.com www.earningstable.com;
    # ... konfigurácia pre earningstable
}
```

**Ako to funguje:**
1. Požiadavka príde na IP `89.185.250.213:443`
2. Nginx prečíta hlavičku `Host: premarketprice.com`
3. Nginx porovná `Host` hlavičku so všetkými `server_name` direktívami
4. Nájde zhodu a použije príslušnú konfiguráciu
5. Požiadavka sa presmeruje na lokálny server `127.0.0.1:3000`

## 🔐 SSL Certifikáty

**Dôležité:** Každá doména potrebuje svoj vlastný SSL certifikát!

V konfigurácii máte:

```nginx
# Pre premarketprice.com
ssl_certificate /etc/letsencrypt/live/premarketprice.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/premarketprice.com/privkey.pem;

# Pre earningstable.com
ssl_certificate /etc/letsencrypt/live/earningstable.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/earningstable.com/privkey.pem;
```

**Generovanie certifikátov cez certbot:**

```bash
# Pre premarketprice.com
sudo certbot certonly --nginx -d premarketprice.com -d www.premarketprice.com

# Pre earningstable.com
sudo certbot certonly --nginx -d earningstable.com -d www.earningstable.com
```

## 🎯 Prečo to funguje?

**Identifikátor nie je IP adresa, ale názov domény v HTTP hlavičke `Host`.**

- ✅ DNS rozlišuje domény podľa názvu → vracia IP adresu
- ✅ Nginx rozlišuje domény podľa `Host` hlavičky → vyberie správnu konfiguráciu
- ✅ SSL certifikáty sú viazané na názov domény, nie na IP adresu

## 📝 Príklad toku požiadavky

```
1. Používateľ zadá: https://premarketprice.com
   ↓
2. DNS lookup: premarketprice.com → 89.185.250.213
   ↓
3. TCP spojenie: 89.185.250.213:443
   ↓
4. TLS handshake: Server pošle certifikát pre premarketprice.com
   ↓
5. HTTP požiadavka:
   GET / HTTP/1.1
   Host: premarketprice.com
   ↓
6. Nginx: Porovná "premarketprice.com" so server_name
   ↓
7. Nginx: Nájde zhodu → použije konfiguráciu pre premarketprice.com
   ↓
8. Proxy: Presmeruje na http://127.0.0.1:3000
   ↓
9. Next.js server: Spracuje požiadavku
```

## ⚠️ Dôležité poznámky

1. **SSH prístup:** `ssh root@89.185.250.213` je rovnaký pre obe domény, pretože obe bežia na tom istom serveri. To je v poriadku!

2. **SSL certifikáty:** Musíte mať samostatné certifikáty pre každú doménu. Let's Encrypt to podporuje bez problémov.

3. **Nginx konfigurácia:** Každá doména má svoj vlastný `server` blok s vlastným `server_name`.

4. **Upstream:** Obe domény môžu použiť rovnaký upstream (`127.0.0.1:3000`), ak bežia na tom istom Next.js serveri. Ak potrebujete rôzne aplikácie, môžete mať rôzne upstreamy.

## 🔧 Kontrola konfigurácie

```bash
# Skontrolovať DNS záznamy
dig premarketprice.com
dig earningstable.com

# Skontrolovať Nginx konfiguráciu
sudo nginx -t

# Skontrolovať SSL certifikáty
sudo certbot certificates

# Skontrolovať, či bežia procesy
pm2 status
```

## ✅ Záver

**Nie je potrebný žiadny špeciálny identifikátor!** DNS a Nginx automaticky rozlišujú domény podľa názvu v HTTP hlavičke `Host`. To je štandardný spôsob, ako jeden server obsluhuje viacero domén.

