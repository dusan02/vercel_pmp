const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';

async function test() {
  const res = await fetch(`https://finnhub.io/api/v1/stock/financials?symbol=ASML&statement=ic&freq=annual&token=${apiKey}`);
  const json = await res.json();
  console.log('stock/financials:', json);
}
test();
