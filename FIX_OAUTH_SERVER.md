# 🔧 Oprava Google OAuth na vlastnom serveri

## Situácia
- Aplikácia beží na vlastnom serveri (nie Vercel)
- Environment variables sa nastavujú v `.env` súbore na serveri
- Client ID: `47392532694-0oi9lef3mj7aoa2159bgmtrmncihvdt1.apps.googleusercontent.com`

## Krok 1: Prihlásenie na server

```bash
ssh root@bardusa  # alebo váš SSH prístup
cd /var/www/premarketprice
```

## Krok 2: Skontrolujte aktuálny .env súbor

```bash
# Zobrazte .env súbor (bez zobrazenia citlivých údajov)
cat .env | grep -E "GOOGLE|AUTH|NEXTAUTH" | sed 's/=.*/=***/'
```

## Krok 3: Nastavte/upravte environment variables

```bash
# Otvorte .env súbor na editáciu
nano .env
```

Pridajte alebo upravte tieto riadky:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=47392532694-0oi9lef3mj7aoa2159bgmtrmncihvdt1.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<váš-client-secret-z-google-cloud-console>

# NextAuth Configuration
AUTH_SECRET=<vygenerovaný-secret-32-znakov>
NEXTAUTH_URL=https://premarketprice.com
```

**Dôležité:**
- `GOOGLE_CLIENT_ID` = váš Client ID z Google Cloud Console
- `GOOGLE_CLIENT_SECRET` = váš Client Secret z Google Cloud Console (ak ste ho stratili, vytvorte nový)
- `AUTH_SECRET` = náhodný string min. 32 znakov (môže byť rovnaký ako už máte)
- `NEXTAUTH_URL` = presne `https://premarketprice.com` (bez trailing slash)

## Krok 4: Ak nemáte Client Secret

Ak ste stratili Client Secret:

1. **V Google Cloud Console:**
   - Choďte na **APIs & Services** → **Credentials**
   - Kliknite na váš OAuth Client ID
   - V sekcii "Client secrets" kliknite **"+ Add secret"**
   - Skopírujte nový Client Secret
   - **Dôležité:** Uložte ho bezpečne, nebude sa zobrazovať znova!

2. **Aktualizujte .env:**
   ```bash
   nano .env
   # Upravte GOOGLE_CLIENT_SECRET na nový secret
   ```

## Krok 5: Vygenerujte AUTH_SECRET (ak nemáte)

```bash
# Na serveri vygenerujte náhodný secret
openssl rand -base64 32
```

Alebo použite online generátor: https://generate-secret.vercel.app/32

## Krok 6: Skontrolujte, či sú premenné správne nastavené

```bash
# Skontrolujte, či sú premenné načítané
source .env 2>/dev/null
echo "GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
echo "GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:+SET}"
echo "AUTH_SECRET: ${AUTH_SECRET:+SET}"
echo "NEXTAUTH_URL: $NEXTAUTH_URL"
```

## Krok 7: Reštartujte aplikáciu

```bash
# Zastavte PM2 procesy
pm2 stop all

# Skontrolujte, či ecosystem.config.js načítava .env správne
cat ecosystem.config.js | grep -A 5 "env_production"

# Reštartujte aplikáciu
pm2 restart all

# Alebo ak používate ecosystem.config.js:
pm2 delete all
pm2 start ecosystem.config.js --env production

# Skontrolujte logy
pm2 logs premarketprice --lines 20
```

## Krok 8: Overenie

### Test 1: Skontrolujte API endpoint

```bash
curl http://localhost:3000/api/auth/providers
```

Mali by ste vidieť:
```json
{
  "google": {
    "id": "google",
    "name": "Google",
    ...
  }
}
```

### Test 2: Skontrolujte logy pre chyby

```bash
pm2 logs premarketprice --lines 50 | grep -i "oauth\|google\|auth"
```

Ak vidíte varovania o chýbajúcich credentials, skontrolujte `.env` súbor.

### Test 3: Test na produkcii

1. Otvorte `https://premarketprice.com`
2. Kliknite "Sign In"
3. Mala by sa otvoriť Google prihlasovacia stránka

## Krok 9: Časté problémy

### Problém: "OAuth client was not found"

**Príčina:** `GOOGLE_CLIENT_ID` nie je správne nastavený

**Riešenie:**
```bash
# Skontrolujte .env súbor
grep GOOGLE_CLIENT_ID .env

# Musí byť presne:
# GOOGLE_CLIENT_ID=47392532694-0oi9lef3mj7aoa2159bgmtrmncihvdt1.apps.googleusercontent.com
```

### Problém: "invalid_client"

**Príčina:** `GOOGLE_CLIENT_SECRET` nie je správne nastavený alebo je starý

**Riešenie:**
1. Vytvorte nový Client Secret v Google Cloud Console
2. Aktualizujte `GOOGLE_CLIENT_SECRET` v `.env`
3. Reštartujte aplikáciu

### Problém: "redirect_uri_mismatch"

**Príčina:** Redirect URI v Google Cloud Console nezhoduje sa s `NEXTAUTH_URL`

**Riešenie:**
1. Skontrolujte `NEXTAUTH_URL` v `.env` (musí byť `https://premarketprice.com`)
2. V Google Cloud Console skontrolujte redirect URI:
   - Musí byť: `https://premarketprice.com/api/auth/callback/google`
   - Presne s HTTPS, bez trailing slash

### Problém: PM2 nenačítava .env

**Príčina:** `ecosystem.config.js` nemusí správne načítavať .env

**Riešenie:**
Skontrolujte `ecosystem.config.js` - mal by obsahovať:
```javascript
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '.env');
const envVars = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim();
    }
  });
}

module.exports = {
  apps: [{
    name: 'premarketprice',
    // ...
    env_production: {
      GOOGLE_CLIENT_ID: envVars.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: envVars.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      AUTH_SECRET: envVars.AUTH_SECRET || process.env.AUTH_SECRET,
      NEXTAUTH_URL: envVars.NEXTAUTH_URL || process.env.NEXTAUTH_URL,
      // ... ostatné premenné
    }
  }]
};
```

## Krok 10: Rýchla kontrola

```bash
# 1. Skontrolujte .env
cat .env | grep -E "GOOGLE|AUTH|NEXTAUTH"

# 2. Skontrolujte, či PM2 vidí premenné
pm2 env 0 | grep -E "GOOGLE|AUTH|NEXTAUTH"

# 3. Test API
curl http://localhost:3000/api/auth/providers

# 4. Skontrolujte logy
pm2 logs premarketprice --lines 10 --nostream | grep -i "oauth\|google\|auth"
```

## Kontakt

Ak problém pretrváva, skontrolujte:
- Google Cloud Console → OAuth Client → Authorized redirect URIs
- `.env` súbor na serveri
- PM2 logy pre chybové hlášky
- `ecosystem.config.js` konfiguráciu

