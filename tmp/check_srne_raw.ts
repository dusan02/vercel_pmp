const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX'; // From .env.local

async function main() {
  const symbol = 'SRNE';
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
}


main().catch(console.error);

export {};
