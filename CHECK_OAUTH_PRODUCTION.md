# 🔍 Kontrola Google OAuth na produkcii

## Krok 1: Overenie Google Cloud Console ✅

Z obrázku vidím, že OAuth Client je správne nakonfigurovaný:
- ✅ **Authorized JavaScript origins:**
  - `http://localhost:3000`
  - `https://premarketprice.com`
  - `https://www.premarketprice.com`

- ✅ **Authorized redirect URIs:**
  - `http://localhost:3000/api/auth/callback/google`
  - `https://premarketprice.com/api/auth/callback/google`
  - `https://www.premarketprice.com/api/auth/callback/google`

- ✅ **Client secret:** Existuje a je enabled

## Krok 2: Kontrola Environment Variables na Vercel

### Ako skontrolovať:

1. **Otvorte Vercel Dashboard:**
   - Choďte na: https://vercel.com/dashboard
   - Vyberte projekt **premarketprice** (alebo názov vášho projektu)

2. **Skontrolujte Environment Variables:**
   - Choďte na **Settings** → **Environment Variables**
   - Skontrolujte, či existujú tieto premenné pre **Production**:
     - `AUTH_SECRET`
     - `NEXTAUTH_URL`
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`

3. **Dôležité kontroly:**
   - ✅ Všetky 4 premenné musia byť nastavené pre **Production** environment
   - ✅ `NEXTAUTH_URL` musí byť presne `https://premarketprice.com` (alebo vaša produkčná URL)
   - ✅ `GOOGLE_CLIENT_ID` musí byť rovnaký ako v Google Cloud Console
   - ✅ `GOOGLE_CLIENT_SECRET` musí byť rovnaký ako v Google Cloud Console (maskovaný ako `****ovP1`)

## Krok 3: Overenie cez API

### Test 1: Skontrolujte, či je Google provider dostupný

```bash
curl https://premarketprice.com/api/auth/providers
```

**Očakávaná odpoveď:**
```json
{
  "google": {
    "id": "google",
    "name": "Google",
    "type": "oauth",
    "signinUrl": "https://premarketprice.com/api/auth/signin/google",
    "callbackUrl": "https://premarketprice.com/api/auth/callback/google"
  }
}
```

**Ak vidíte túto odpoveď:** ✅ Google provider je správne nakonfigurovaný

**Ak vidíte chybu alebo prázdny objekt:** ❌ Environment variables nie sú správne nastavené

### Test 2: Skontrolujte sign-in URL

```bash
curl -I https://premarketprice.com/api/auth/signin/google
```

**Očakávaná odpoveď:**
- HTTP 302 (redirect) na Google OAuth stránku
- Header `Location` obsahuje `accounts.google.com`

**Ak vidíte 302 redirect:** ✅ Sign-in funguje

**Ak vidíte 401 alebo 500:** ❌ Problém s konfiguráciou

## Krok 4: Kontrola v kóde

### Skontrolujte `src/auth.ts`:

```typescript
Google({
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
}),
```

**Problém:** Ak `GOOGLE_CLIENT_ID` alebo `GOOGLE_CLIENT_SECRET` sú prázdne stringy (`""`), NextAuth nebude fungovať.

### Riešenie:

Pridajte validáciu do `src/auth.ts`:

```typescript
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
    console.error('⚠️ Google OAuth credentials are missing!');
    console.error('GOOGLE_CLIENT_ID:', googleClientId ? '✅ Set' : '❌ Missing');
    console.error('GOOGLE_CLIENT_SECRET:', googleClientSecret ? '✅ Set' : '❌ Missing');
}
```

## Krok 5: Časté problémy a riešenia

### Problém 1: "OAuth client was not found"

**Príčina:** `GOOGLE_CLIENT_ID` nie je nastavený alebo je nesprávny

**Riešenie:**
1. Skopírujte Client ID z Google Cloud Console
2. Nastavte ho v Vercel → Settings → Environment Variables → Production
3. Redeploy aplikácie

### Problém 2: "invalid_client"

**Príčina:** `GOOGLE_CLIENT_SECRET` nie je nastavený alebo je nesprávny

**Riešenie:**
1. V Google Cloud Console kliknite na "+ Add secret" (ak ste stratili pôvodný)
2. Skopírujte nový Client Secret
3. Nastavte ho v Vercel → Settings → Environment Variables → Production
4. Redeploy aplikácie

### Problém 3: "redirect_uri_mismatch"

**Príčina:** Redirect URI v Google Cloud Console nezhoduje sa s tým, čo používa aplikácia

**Riešenie:**
1. Skontrolujte `NEXTAUTH_URL` v Vercel (musí byť `https://premarketprice.com`)
2. Skontrolujte redirect URI v Google Cloud Console (musí byť `https://premarketprice.com/api/auth/callback/google`)
3. Musia byť presne rovnaké (s HTTPS, bez trailing slash)

### Problém 4: Lokálne funguje, produkcia nie

**Príčina:** Environment variables nie sú nastavené pre Production environment

**Riešenie:**
1. V Vercel → Settings → Environment Variables
2. Skontrolujte, že premenné sú nastavené pre **Production** (nie len Preview/Development)
3. Redeploy aplikácie

## Krok 6: Debugging na produkcii

### Pridajte logging do `src/auth.ts`:

```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        }),
    ],
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-key-change-in-production",
    trustHost: true,
    pages: {
        signIn: '/',
        error: '/',
    },
    callbacks: {
        async session({ session, user }) {
            if (session.user) {
                session.user.id = user.id;
            }
            return session;
        },
        async signIn({ user, account, profile }) {
            // Debug logging (len pre development)
            if (process.env.NODE_ENV === 'development') {
                console.log('🔐 Sign in attempt:', {
                    provider: account?.provider,
                    userId: user?.id,
                    email: user?.email
                });
            }
            
            if (account?.provider === 'google') {
                return true;
            }
            return false;
        },
    },
    debug: process.env.NODE_ENV === 'development',
})
```

## Krok 7: Kontrolný checklist

Pred kontaktovaním podpory, skontrolujte:

- [ ] Google OAuth Client existuje v Google Cloud Console
- [ ] Authorized redirect URIs sú správne nastavené
- [ ] `GOOGLE_CLIENT_ID` je nastavený v Vercel pre Production
- [ ] `GOOGLE_CLIENT_SECRET` je nastavený v Vercel pre Production
- [ ] `NEXTAUTH_URL` je nastavený na `https://premarketprice.com` v Vercel pre Production
- [ ] `AUTH_SECRET` je nastavený v Vercel pre Production
- [ ] Aplikácia bola redeployovaná po nastavení environment variables
- [ ] Test API endpoint `/api/auth/providers` vracia Google provider

## Krok 8: Rýchla oprava

Ak chcete rýchlo opraviť problém:

1. **Skopírujte Client ID a Secret z Google Cloud Console**
2. **V Vercel → Settings → Environment Variables:**
   - Pridajte/upravte `GOOGLE_CLIENT_ID` (pre Production)
   - Pridajte/upravte `GOOGLE_CLIENT_SECRET` (pre Production)
   - Skontrolujte `NEXTAUTH_URL` = `https://premarketprice.com` (pre Production)
   - Skontrolujte `AUTH_SECRET` je nastavený (pre Production)

3. **Redeploy:**
   - Vercel → Deployments → Najnovší deployment → Redeploy

4. **Test:**
   - Otvorte `https://premarketprice.com`
   - Kliknite "Sign In"
   - Mala by sa otvoriť Google prihlasovacia stránka

