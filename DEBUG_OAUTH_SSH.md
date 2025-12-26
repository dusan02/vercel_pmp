# 🔍 Debug OAuth Configuration na SSH Serveri

## Krok 1: Skontrolujte Environment Variables v PM2 Procese

```bash
# Skontrolujte, či PM2 proces vidí environment variables
pm2 show premarketprice | grep -A 20 "env:"
```

Alebo:

```bash
# Skontrolujte konkrétne premenné
pm2 env premarketprice | grep -E "GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|AUTH_SECRET|NEXTAUTH_URL"
```

## Krok 2: Test Nového Config Check Endpointu

```bash
curl http://localhost:3000/api/config-check
```

**Očakávaná odpoveď (ak je všetko OK):**
```json
{
  "hasGoogleClientId": true,
  "hasGoogleClientSecret": true,
  "hasAuthSecret": true,
  "hasNextAuthUrl": true,
  "nextAuthUrl": "https://premarketprice.com",
  "googleClientIdPrefix": "47392532694-0oi9lef3",
  "isConfigValid": true
}
```

**Ak vidíte `"isConfigValid": false`**, znamená to, že niektoré environment variables chýbajú.

## Krok 3: Skontrolujte .env Súbor

```bash
cd /var/www/premarketprice
cat .env | grep -E "GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|AUTH_SECRET|NEXTAUTH_URL"
```

## Krok 4: Skontrolujte, či PM2 Načítava .env

```bash
# Skontrolujte ecosystem.config.js
cat /var/www/premarketprice/ecosystem.config.js | grep -A 5 "env_production"
```

## Krok 5: Ak Environment Variables Chýbajú v PM2

Ak PM2 nevidí environment variables, reštartujte procesy:

```bash
cd /var/www/premarketprice
pm2 restart ecosystem.config.js --update-env
```

Alebo:

```bash
pm2 delete all
cd /var/www/premarketprice
pm2 start ecosystem.config.js
```

## Krok 6: Test Providers Endpointu

```bash
curl http://localhost:3000/api/auth/providers
```

**Očakávaná odpoveď:**
```json
{"google":{"id":"google","name":"Google","type":"oidc","signinUrl":"https://premarketprice.com/api/auth/signin/google","callbackUrl":"https://premarketprice.com/api/auth/callback/google"}}
```

**Ak vidíte redirect na `?error=Configuration`**, znamená to, že NextAuth detekoval problém s konfiguráciou.

## Krok 7: Skontrolujte Logy

```bash
pm2 logs premarketprice --lines 50 --nostream | grep -i "oauth\|auth\|google\|config"
```

## Riešenie Problémov

### Problém: `isConfigValid: false`

**Riešenie:**
1. Skontrolujte `.env` súbor - všetky premenné musia byť nastavené
2. Reštartujte PM2 procesy s `--update-env`
3. Skontrolujte, či `ecosystem.config.js` správne načítava `.env`

### Problém: Redirect na `?error=Configuration`

**Príčiny:**
- Environment variables nie sú správne načítané v PM2
- `GOOGLE_CLIENT_ID` alebo `GOOGLE_CLIENT_SECRET` sú prázdne
- `AUTH_SECRET` chýba alebo je príliš krátky
- `NEXTAUTH_URL` nie je nastavený

**Riešenie:**
1. Spustite `curl http://localhost:3000/api/auth/config-check`
2. Skontrolujte, ktoré premenné chýbajú
3. Pridajte ich do `.env` súboru
4. Reštartujte PM2 procesy

### Problém: PM2 Nevidí Environment Variables

**Riešenie:**
```bash
cd /var/www/premarketprice
# Skontrolujte .env
cat .env

# Reštartujte PM2 s načítaním nových env variables
pm2 restart ecosystem.config.js --update-env

# Alebo úplne reštartujte
pm2 delete all
pm2 start ecosystem.config.js
```

## Kontrolný Checklist

- [ ] `.env` súbor obsahuje všetky 4 premenné
- [ ] `ecosystem.config.js` správne načítava `.env`
- [ ] PM2 procesy vidia environment variables (`pm2 env premarketprice`)
- [ ] `/api/auth/config-check` vracia `"isConfigValid": true`
- [ ] `/api/auth/providers` vracia Google provider (nie redirect)
- [ ] Logy neobsahujú OAuth/Auth chyby

