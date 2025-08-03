# Vercel Settings Export

## Environment Variables

```
POLYGON_API_KEY=Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX
UPSTASH_REDIS_REST_URL=https://touched-albacore-7466.ups...
UPSTASH_REDIS_REST_TOKEN=AR0qAAIjcDFmZjIwYmMzYzc2NDk0ZmYxY...
NODE_ENV=production
```

## Build Settings

- **Framework**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install --legacy-peer-deps`
- **Node Version**: 22.x

## Domains

- `pmp-prod-cl4b.vercel.app`
- `www.premarketprice.com`
- `https://pmp-prod-cl4b-dusans-projects-6edd3db8.vercel.app`
- `https://pmp-prod.vercel.app`

## Project Info

- **Project Name**: pmp-prod-cl4b
- **Team**: dusans-projects-6edd3db8
- **Repository**: https://github.com/dusan02/pmp_prod.git
- **Branch**: main
- **Latest Production URL**: https://pmp-prod-cl4b-dusans-projects-6edd3db8.vercel.app

## Configuration Files

- `vercel.json` - Vercel konfigurácia
- `.npmrc` - npm nastavenia
- `package.json` - závislosti a skripty

## Environment Coverage

- **UPSTASH_REDIS_REST_URL**: Development, Preview, Production
- **UPSTASH_REDIS_REST_TOKEN**: Development, Preview, Production
- **POLYGON_API_KEY**: Production, Preview, Development
- **NODE_ENV**: Production, Preview, Development

## Important Notes

- ✅ REDIS_URL odstránené (spôsobovalo problémy)
- ✅ Používa sa Upstash Redis namiesto lokálneho
- ✅ API kľúče sú správne nastavené
- ✅ Vercel CLI je pripojené a funkčné
- ⚠️ Denný limit nasadení: 100 (bezplatný plán)

## Deployment Status

- **Last Deployment**: Failed (npm registry error)
- **Next Deployment**: Po 5 hodinách (limit reset)
- **Expected Result**: Ceny sa budú zobrazovať správne namiesto 0.00

## CLI Commands

```bash
# Zobraziť environment premenné
vercel env ls

# Zobraziť projekty
vercel project ls

# Export projektu
vercel pull

# Zobraziť deployment history
vercel ls
```
