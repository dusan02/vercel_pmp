const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX'; // From .env.local

async function main() {
  const symbols = ['JWN', 'GPS'];
  for (const symbol of symbols) {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.log(`${symbol}: V2 Error ${resp.status}`);
      continue;
    }
    const data = await resp.json();
    console.log(`${symbol}: V2 Price=${data.ticker?.day?.c}`);
  }
}


main().catch(console.error);

export {};
