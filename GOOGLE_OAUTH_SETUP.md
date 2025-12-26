# 🔐 Google OAuth Setup Guide

## Problém

- **Lokálne:** Funguje, ale zobrazuje sa meno a obrázok (možno vyzerá divne)
- **Produkcia:** Nefunguje - chyba "OAuth client was not found" / "invalid_client"

## Riešenie

### 1. Lokálne nastavenie

V `.env.local` potrebujete:

```env
# NextAuth Configuration
AUTH_SECRET=your-random-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

**AUTH_SECRET:** Vygenerujte náhodný string:
```bash
# PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# Alebo použite online generátor: https://generate-secret.vercel.app/32
```

### 2. Produkcia (Vercel) nastavenie

#### Krok 1: Vytvorte Google OAuth Client

1. Choďte na [Google Cloud Console](https://console.cloud.google.com/)
2. Vyberte alebo vytvorte projekt
3. Choďte na **APIs & Services** → **Credentials**
4. Kliknite **Create Credentials** → **OAuth client ID**
5. Vyberte **Web application**
6. Nastavte:
   - **Name:** PreMarketPrice Production
   - **Authorized JavaScript origins:**
     - `https://premarketprice.com`
     - `https://www.premarketprice.com`
   - **Authorized redirect URIs:**
     - `https://premarketprice.com/api/auth/callback/google`
     - `https://www.premarketprice.com/api/auth/callback/google`
7. Kliknite **Create**
8. Skopírujte **Client ID** a **Client Secret**

#### Krok 2: Nastavte Environment Variables v Vercel

1. Choďte na [Vercel Dashboard](https://vercel.com/dashboard)
2. Vyberte projekt **premarketprice**
3. Choďte na **Settings** → **Environment Variables**
4. Pridajte tieto premenné:

```
AUTH_SECRET=<vygenerovaný-secret-32-znakov>
NEXTAUTH_URL=https://premarketprice.com
GOOGLE_CLIENT_ID=<váš-google-client-id>
GOOGLE_CLIENT_SECRET=<váš-google-client-secret>
```

**Dôležité:**
- `AUTH_SECRET` musí byť rovnaký pre všetky environmenty (Production, Preview, Development)
- `NEXTAUTH_URL` musí byť `https://premarketprice.com` pre Production
- `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET` musia byť z Google Cloud Console

#### Krok 3: Redeploy aplikácie

Po pridaní environment variables:
1. Choďte na **Deployments**
2. Kliknite na najnovší deployment
3. Kliknite **Redeploy**

### 3. Oprava zobrazenia (Lokálne)

Ak sa vám nepozdáva zobrazenie mena a obrázku v headeri, môžete:

**Možnosť A:** Skryť meno (len obrázok)
- Už implementované v `LoginButton.tsx` - meno je skryté, len obrázok a "Sign Out"

**Možnosť B:** Úplne skryť user info (len tlačidlo)
- Upravte `LoginButton.tsx` podľa potreby

### 4. Overenie

#### Lokálne:
1. Spustite `npm run dev:server`
2. Otvorte `http://localhost:3000`
3. Kliknite "Sign In"
4. Mala by sa otvoriť Google prihlasovacia stránka
5. Po prihlásení by ste mali vidieť obrázok a "Sign Out" tlačidlo

#### Produkcia:
1. Otvorte `https://premarketprice.com`
2. Kliknite "Sign In"
3. Mala by sa otvoriť Google prihlasovacia stránka
4. Po prihlásení by ste mali vidieť obrázok a "Sign Out" tlačidlo

### 5. Troubleshooting

#### Chyba: "OAuth client was not found"
- Skontrolujte, či je `GOOGLE_CLIENT_ID` správne nastavený
- Skontrolujte, či je redirect URI správne nastavený v Google Cloud Console

#### Chyba: "invalid_client"
- Skontrolujte, či je `GOOGLE_CLIENT_SECRET` správne nastavený
- Skontrolujte, či sú environment variables nastavené v správnom environmente (Production)

#### Chyba: "AUTH_SECRET is missing"
- Skontrolujte, či je `AUTH_SECRET` nastavený
- Pre Vercel: Skontrolujte, či je nastavený pre Production environment

#### Lokálne funguje, produkcia nie
- Skontrolujte, či sú redirect URIs správne nastavené v Google Cloud Console
- Skontrolujte, či je `NEXTAUTH_URL` správne nastavený (`https://premarketprice.com` pre produkciu)

### 6. Bezpečnostné poznámky

- **NIKDY** necommitnite `.env.local` do Git
- `AUTH_SECRET` musí byť náhodný a bezpečný (min. 32 znakov)
- `GOOGLE_CLIENT_SECRET` je citlivý údaj - používajte len v environment variables
- Pre produkciu používajte vždy HTTPS

### 7. Testovanie

Po nastavení môžete otestovať:

```bash
# Lokálne
curl http://localhost:3000/api/auth/providers

# Produkcia
curl https://premarketprice.com/api/auth/providers
```

Mali by ste vidieť Google provider v odpovedi.

