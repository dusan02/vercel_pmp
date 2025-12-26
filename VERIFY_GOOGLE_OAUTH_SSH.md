# 🔍 Overenie Google OAuth Konfigurácie na SSH Serveri

## Krok 1: Skontrolujte Environment Variables na Serveri

```bash
cd /var/www/premarketprice

# Zobrazte Client ID (prvých 20 znakov)
cat .env | grep GOOGLE_CLIENT_ID

# Zobrazte, či je Client Secret nastavený (bez zobrazenia hodnoty)
cat .env | grep GOOGLE_CLIENT_SECRET | cut -d'=' -f1
```

## Krok 2: Porovnajte s Google Cloud Console

1. Choďte na [Google Cloud Console](https://console.cloud.google.com/)
2. Vyberte projekt
3. Choďte na **APIs & Services** → **Credentials**
4. Nájdite OAuth 2.0 Client ID
5. Skontrolujte:
   - **Client ID** - musí sa zhodovať s tým v `.env` súbore
   - **Client Secret** - ak ste ho nedávno zmenili, môže trvať niekoľko minút, kým sa propaguje

## Krok 3: Skontrolujte Redirect URIs v Google Cloud Console

V Google Cloud Console, v OAuth 2.0 Client ID nastaveniach, skontrolujte **Authorized redirect URIs**:

Musí obsahovať presne:
```
https://premarketprice.com/api/auth/callback/google
```

**Dôležité:**
- Musí byť s `https://` (nie `http://`)
- Musí byť bez trailing slash na konci
- Musí byť presne `/api/auth/callback/google`

## Krok 4: Ak Client Secret bol nedávno zmenený

Ak ste nedávno vygenerovali nový Client Secret:

1. **Počkať 2-5 minút** - Google môže mať oneskorenie pri propagácii
2. **Skontrolovať, či je správne skopírovaný** - Client Secret môže mať špeciálne znaky
3. **Vygenerovať nový Client Secret** ak je potrebné:
   - V Google Cloud Console kliknite na OAuth Client
   - Kliknite na **Reset Secret** alebo **Regenerate Secret**
   - Skopírujte nový secret
   - Aktualizujte ho v `.env` súbore na serveri

## Krok 5: Aktualizácia Client Secret na Serveri

```bash
cd /var/www/premarketprice

# Backup aktuálneho .env
cp .env .env.backup

# Upravte .env súbor (použite nano alebo vim)
nano .env

# Alebo použite sed na nahradenie (nahraďte NOVY_SECRET skutočným novým secretom)
# sed -i 's/GOOGLE_CLIENT_SECRET=.*/GOOGLE_CLIENT_SECRET=NOVY_SECRET/' .env

# Po úprave reštartujte PM2
pm2 restart ecosystem.config.js --update-env
```

## Krok 6: Testovanie

```bash
# Počkať 30 sekúnd
sleep 30

# Test config-check
curl http://localhost:3000/api/config-check

# Test providers
curl http://localhost:3000/api/auth/providers

# Skontrolujte logy
pm2 logs premarketprice --lines 20 --nostream | grep -i "oauth\|auth\|google"
```

## Časté Problémy

### Problém 1: "OAuth client was not found"
**Príčina:** Client ID nie je správny alebo neexistuje v Google Cloud Console
**Riešenie:** Skontrolujte Client ID v `.env` a porovnajte s Google Cloud Console

### Problém 2: "invalid_client"
**Príčina:** Client Secret nie je správny alebo bol nedávno zmenený
**Riešenie:** 
- Počkať 2-5 minút (propagácia zmien)
- Skontrolovať, či je Client Secret správne skopírovaný (bez medzier, nových riadkov)
- Vygenerovať nový Client Secret a aktualizovať ho

### Problém 3: "redirect_uri_mismatch"
**Príčina:** Redirect URI v Google Cloud Console nezhoduje sa s tým, čo používa aplikácia
**Riešenie:** Skontrolujte, či je v Google Cloud Console nastavený presne `https://premarketprice.com/api/auth/callback/google`

## Kontrolný Checklist

- [ ] Client ID v `.env` sa zhoduje s Google Cloud Console
- [ ] Client Secret v `.env` sa zhoduje s Google Cloud Console (alebo bol nedávno aktualizovaný)
- [ ] Redirect URI v Google Cloud Console je `https://premarketprice.com/api/auth/callback/google`
- [ ] `NEXTAUTH_URL` v `.env` je `https://premarketprice.com` (bez trailing slash)
- [ ] Počkali ste 2-5 minút po zmene Client Secret
- [ ] PM2 procesy boli reštartované po zmene `.env`

