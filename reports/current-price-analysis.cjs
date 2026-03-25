/**
 * GEMINI REPORT - CURRENT PRICE CALCULATION
 * Detailná analýza výpočtu aktuálnej ceny
 */

// ===== POLYGON SNAPSHOT API =====
const fetchCurrentPrice = async (symbol, apiKey) => {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbol}&apiKey=${apiKey}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.tickers && data.tickers.length > 0) {
    const ticker = data.tickers[0];
    
    // Priorita zdrojov ceny:
    // 1. lastTrade.p - posledný obchod (najviac aktuálne)
    // 2. min.c - posledná známa cena (pre-market/after-hours)
    // 3. day.c - posledná close cena (fallback)
    
    const currentPrice = ticker.lastTrade?.p ||           // Posledný trade
                          ticker.min?.c ||                 // Minúta data
                          ticker.day?.c;                   // Day close
    
    const timestamp = ticker.lastTrade?.t ||              // Timestamp posledného trade
                       ticker.min?.t ||                   // Timestamp minúty
                       Date.now();                        // Fallback
    
    return {
      symbol: ticker.ticker,
      price: currentPrice,
      timestamp: new Date(timestamp),
      source: ticker.lastTrade?.p ? 'last_trade' : 'minute_data',
      volume: ticker.day?.v || 0,
      change: ticker.min?.c && ticker.min?.av ? 
               ticker.min.c - ticker.min.av : null
    };
  }
  
  return null;
};

// ===== PRIKLAD Z REALNÉHO KÓDU (polygonWorker.ts) =====
interface PolygonSnapshot {
  ticker: string;
  day?: {
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
  };
  prevDay?: {
    c: number; // previous close
  };
  min?: {
    av: number; // average price
    t: number; // timestamp
    c?: number; // close price (pre-market/after-hours)
    o?: number; // open price
    h?: number; // high price
    l?: number; // low price
    v?: number; // volume
  };
  lastQuote?: {
    p: number; // price
    t: number; // timestamp
  };
  lastTrade?: {
    p: number; // price
    t: number; // timestamp
  };
}

// Výpočet efektívnej ceny
const resolveEffectivePrice = (snapshot: PolygonSnapshot): number | null => {
  // Priorita: lastTrade > min.c > day.c
  if (snapshot.lastTrade?.p) return snapshot.lastTrade.p;
  if (snapshot.min?.c) return snapshot.min.c;
  if (snapshot.day?.c) return snapshot.day.c;
  return null;
};

console.log('=== CURRENT PRICE VÝPOČET ===');
console.log('1. Zdroj: Polygon Snapshot API');
console.log('2. Priorita: lastTrade.p > min.c > day.c');
console.log('3. Výsledok: aktuálna cena s timestamp');
