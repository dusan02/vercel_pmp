# PreMarketPrice.com

Aplikácia pre zobrazenie pre-market dát akcií S&P 500 spoločností s kompaktným dizajnom.

## Funkcie

- 📊 Zobrazenie pre-market percentuálnych zmien
- 💰 Rozdiely v trhovej kapitalizácii
- ⭐ Systém obľúbených akcií
- 🔄 Možnosť obnovenia dát
- 📱 Responzívny dizajn
- 🎨 Kompaktný vzhľad pre efektívne využitie priestoru
- ⏰ Live aktualizácie každých 5-15 minút

## Časové rady a dostupnosť dát

Aplikácia poskytuje live dáta v reálnom čase s nasledujúcimi časovými oknami:

### 🌅 **Pre-market trading** (4:00-9:30 AM EST)

- Dostupné pre-market ceny akcií
- Aktualizácie každých 5-15 minút
- Percentuálne zmeny oproti včerajšej zatváracej cene

### 📈 **Trhové hodiny** (9:30 AM-4:00 PM EST)

- Live ceny počas obchodných hodín
- Kontinuálne aktualizácie
- Real-time percentuálne zmeny

### 🌙 **After-hours trading** (4:00 PM-4:00 AM EST)

- After-hours ceny po zatvorení trhu
- Pokračujúce aktualizácie
- Zmeny oproti dennej zatváracej cene

### ⏰ **Dostupnosť aktuálnych cien**

**Live ceny sú dostupné od 4:00 AM do 4:00 AM EST denne**, pokrývajúc kompletnú obchodnú reláciu vrátane pre-market a after-hours období.

### 🔄 **Aktualizačný systém**

- **Background service:** Aktualizácie každých 5 minút
- **Cache system:** Aktualizácie každých 15 minút
- **Polygon.io API:** Zdroj reálnych trhových dát
- **Redis cache:** Rýchle načítanie dát
- **SQLite databáza:** Ukladanie histórie cien

## Trading Hours & Data Availability

### 📊 **Market Cap Výpočty**

Aplikácia používa presné výpočty trhovej kapitalizácie s validáciou dát:

#### Základné vzorce
```
Market Cap (B) = (Cena × Počet akcií) ÷ 1,000,000,000
% Change = (Aktuálna Cena - Referenčná Cena) ÷ Referenčná Cena × 100
```

#### Dátové zdroje (podľa priority)
1. **Cache** (Redis) - Najrýchlejšie, 15-minútový TTL
2. **SessionPrice** (DB) - Aktuálne session dáta
3. **Ticker** (DB) - Fallback denormalizované dáta

#### Validácia a filtrovanie
- ✅ **Market Cap > 0** (filteruje nulové hodnoty)
- ✅ **Market Cap < $10T** (filteruje extrémne hodnoty)  
- ✅ **|% Change| ≤ 100%** (filteruje chybné dáta)
- ⚠️ **Varovania** o možných stock splits a chybách

**Detailná dokumentácia:** [docs/market-cap-calculations.md](docs/market-cap-calculations.md)
**Technická dokumentácia:** [docs/technical-calculations.md](docs/technical-calculations.md)
**Pre vývojárov:** [docs/developer-guide.md](docs/developer-guide.md)
**Architektúra:** [docs/technical-architecture.md](docs/technical-architecture.md)

The application provides live data in real-time with the following trading windows:

### 🌅 **Pre-market Trading** (4:00-9:30 AM EST)

- Available pre-market stock prices
- Updates every 5-15 minutes
- Percentage changes vs. previous day's closing price

### 📈 **Market Hours** (9:30 AM-4:00 PM EST)

- Live prices during trading hours
- Continuous updates
- Real-time percentage changes

### 🌙 **After-hours Trading** (4:00 PM-4:00 AM EST)

- After-hours prices after market close
- Continuing updates
- Changes vs. daily closing price

### ⏰ **Current Price Availability**

**Live prices are available from 4:00 AM to 4:00 AM EST daily**, covering the complete trading session including pre-market and after-hours periods.

### 🔄 **Update System**

- **Background service:** Updates every 5 minutes
- **Cache system:** Updates every 15 minutes
- **Polygon.io API:** Source of real market data
- **Redis cache:** Fast data loading
- **SQLite database:** Price history storage

## Technológie

- **Frontend**: Next.js 15.4.4, React 19.1.0
- **Styling**: CSS s CSS Variables (podpora dark/light mode)
- **Icons**: Lucide React
- **Data**: Polygon.io API pre reálne trhové dáta
- **Cache**: Redis pre rýchle načítanie
- **Database**: SQLite pre históriu cien
- **Background Service**: Node.js pre kontinuálne aktualizácie
- **Port**: 3002

## Technologies

- **Frontend**: Next.js 15.4.4, React 19.1.0
- **Styling**: CSS with CSS Variables (dark/light mode support)
- **Icons**: Lucide React
- **Data**: Polygon.io API for real market data
- **Cache**: Redis for fast data loading
- **Database**: SQLite for price history
- **Background Service**: Node.js for continuous updates
- **Port**: 3002

## Inštalácia

1. **Klonovanie repozitára**:

   ```bash
   git clone <repository-url>
   cd PreMarketPrice
   ```

2. **Inštalácia závislostí**:

   ```bash
   npm install
   ```

3. **Spustenie Redis servera** (vyžadované pre cache):

   ```bash
   # Pomocou Docker Compose (odporúčané)
   docker-compose up -d

   # Alebo manuálne spustenie Redis
   docker run -d -p 6379:6379 redis:alpine
   ```

4. **Spustenie vývojového servera**:

   ```bash
   npm run dev
   ```

5. **Otvorenie aplikácie**:
   Otvorte prehliadač a prejdite na `http://localhost:3002`

## Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd PreMarketPrice
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start Redis server** (required for cache):

   ```bash
   # Using Docker Compose (recommended)
   docker-compose up -d

   # Or manual Redis startup
   docker run -d -p 6379:6379 redis:alpine
   ```

4. **Start development server**:

   ```bash
   npm run dev
   ```

5. **Open the application**:
   Open your browser and navigate to `http://localhost:3002`

## Štruktúra projektu

```
src/
├── app/
│   ├── api/
│   │   ├── history/route.ts
│   │   └── prices/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── FavoriteCard.tsx
│   ├── StockTable.tsx
│   └── ThemeToggle.tsx
├── hooks/
│   ├── useSortableData.ts
│   └── useSortableTable.ts
└── lib/
    ├── format.ts
    ├── getLogoUrl.ts
    └── prisma.ts
```

## Konfigurácia

### Port

Aplikácia beží na porte 3002. Ak chcete zmeniť port, upravte `package.json`:

```json
{
  "scripts": {
    "dev": "next dev --turbopack -p 3002"
  }
}
```

### API kľúče

Pre reálne dáta potrebujete Polygon.io API kľúč. Vytvorte `.env.local` súbor:

```env
POLYGON_API_KEY=your_api_key_here
```

## Používanie

1. **Zobrazenie dát**: Aplikácia automaticky zobrazuje live dáta z Polygon.io API
2. **Aktualizácie**: Dáta sa aktualizujú automaticky každých 5-15 minút
3. **Obnovenie dát**: Kliknite na "Refresh Data" pre manuálne načítanie nových dát
4. **Obľúbené**: Kliknite na hviezdičku pre pridanie/odstránenie z obľúbených
5. **Zoradenie**: Kliknite na hlavičky stĺpcov pre zoradenie
6. **Vyhľadávanie**: Použite search box pre filtrovanie spoločností

## Usage

1. **Data Display**: The application automatically displays live data from Polygon.io API
2. **Updates**: Data updates automatically every 5-15 minutes
3. **Refresh Data**: Click "Refresh Data" to manually load new data
4. **Favorites**: Click the star icon to add/remove from favorites
5. **Sorting**: Click column headers to sort data
6. **Search**: Use the search box to filter companies

## Zálohovanie

### Git (Odporúčané)

```bash
# Vytvorenie commit
git add .
git commit -m "Update: description of changes"

# Push na remote repository
git push origin main
```

### Manuálna záloha

Skopírujte celý priečinok projektu na bezpečné miesto.

## Riešenie problémov

### Port už je obsadený

```bash
# Skontrola obsadených portov
netstat -ano | findstr :3002

# Zmena portu v package.json
"dev": "next dev --turbopack -p 3003"
```

### Modul not found chyby

```bash
# Reštartovanie servera
npm run dev

# Preinštalovanie závislostí
npm install
```

## Verzie

- **v0.1.0**: Počiatočná verzia s kompaktným dizajnom
- Port: 3002
- Kompaktné logá (24px)
- Optimalizované rozostupy

## Licencia

MIT License
