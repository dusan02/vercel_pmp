const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX'; // From .env.local

async function checkPolygon(symbol: string) {
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.log(`${symbol}: Error ${resp.status}`);
    return;
  }
  const data = await resp.json();
  console.log(`${symbol}: active=${data.results?.active}, name="${data.results?.name}", market_cap=${data.results?.market_cap}`);
}

async function main() {
  const symbols = ['SRNE', 'MNDT', 'SJI', 'JWN', 'GPS', 'ATVI', 'PEAK', 'WRK'];
  for (const s of symbols) {
    await checkPolygon(s);
  }
}


main().catch(console.error);

export {};
