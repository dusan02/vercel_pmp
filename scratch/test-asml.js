const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';

async function test() {
  const res = await fetch(`https://finnhub.io/api/v1/stock/financials-reported?symbol=ASML&freq=annual&token=${apiKey}`);
  const json = await res.json();
  console.log('Reported financials count:', json.data?.length || 0);
  
  const metricRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=ASML&metric=all&token=${apiKey}`);
  const metricJson = await metricRes.json();
  console.log('Metrics available:', !!metricJson.metric);
}
test();
