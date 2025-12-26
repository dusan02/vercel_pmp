# 📊 Posun: **NULOVÝ** ❌

## ❌ ČO SA NEPODARILO

### SSL Certifikát pre premarketprice.com
- **Status:** Stále zlyhá ❌
- **Problém 1:** HTTP-01 challenge - firewall blokuje port 80
- **Problém 2:** DNS-01 challenge - TXT záznamy neboli pridané do DNS alebo ešte nie sú propagované

## 🔍 ZISTENÉ SKUTOČNOSTI

1. **UFW nie je nainštalovaný** - server nepoužíva UFW firewall
   - `ufw: command not found`
   - Pravdepodobne používa iptables alebo iný firewall

2. **DNS-01 challenge zlyhal** - TXT záznamy chýbajú:
   - `_acme-challenge.premarketprice.com` - No TXT record found
   - `_acme-challenge.www.premarketprice.com` - NXDOMAIN

## 🔧 ČO TREBA UROBIŤ

### Krok 1: Skontrolovať, aký firewall používate
```bash
which ufw
which iptables
iptables -L -n | head -20
```

### Krok 2: Otvoriť porty 80 a 443 (ak používate iptables)
```bash
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
iptables-save > /etc/iptables/rules.v4  # Uložiť pravidlá
```

### Krok 3: Pridať TXT záznamy do DNS (pre DNS-01 challenge)
V Active24 DNS správcovi pridať:
- `_acme-challenge.premarketprice.com` → TXT → `275r7Yq2aVm_O4lbYUNwzHiLyODTqPp-apIZoF-Xolk`
- `_acme-challenge.www.premarketprice.com` → TXT → `H92RFOPWgNFSRDXZe61sE6I9pMLRjxnNBSJzEJRNQ7Y`

### Krok 4: Počkať na DNS propagáciu (5-10 minút)
```bash
dig _acme-challenge.premarketprice.com TXT
dig _acme-challenge.www.premarketprice.com TXT
```

### Krok 5: Skúsiť znovu certbot
```bash
certbot certonly --manual --preferred-challenges dns -d premarketprice.com -d www.premarketprice.com
```

