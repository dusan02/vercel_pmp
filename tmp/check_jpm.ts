const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX'; // From .env.local

async function main() {
  const symbol = 'JPM';
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.log(`${symbol}: Error ${resp.status}`);
    return;
  }
  const data = await resp.json();
  console.log(`${symbol}: active=${data.results?.active}`);
}


main().catch(console.error);

export {};
