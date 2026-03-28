const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX'; // From .env.local

async function checkV2(symbol: string) {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.log(`${symbol}: V2 Error ${resp.status}`);
    return;
  }
  const data = await resp.json();
  console.log(`${symbol}: V2 Price=${data.ticker?.day?.c || 'N/A'}`);
}

async function main() {
  const symbols = ['SQ', 'ZEN', 'SPLK', 'SUMO', 'JWN', 'GPS'];
  for (const s of symbols) {
    await checkV2(s);
  }
}


main().catch(console.error);

export {};
