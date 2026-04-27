/**
 * Script to check status of all services (server, websockets, crons)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function checkService(name: string, url: string): Promise<{ name: string; status: 'ok' | 'error'; message: string }> {
  try {
    const response = await fetch(url, { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        name,
        status: 'ok',
        message: JSON.stringify(data, null, 2)
      };
    } else {
      return {
        name,
        status: 'error',
        message: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      name,
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkServicesMain() {
  console.log('='.repeat(70));
  console.log('📊 SERVICES STATUS CHECK');
  console.log('='.repeat(70));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const services = [
    { name: 'Main Server', url: `${BASE_URL}/api/health` },
    { name: 'WebSocket Status', url: `${BASE_URL}/api/websocket` },
    { name: 'Heatmap API', url: `${BASE_URL}/api/heatmap?timeframe=day&metric=percent` },
    { name: 'Stocks API', url: `${BASE_URL}/api/stocks?tickers=AAPL,MSFT` },
  ];

  const results = await Promise.all(
    services.map(s => checkService(s.name, s.url))
  );

  console.log('\nResults:');
  console.log('-'.repeat(70));
  
  results.forEach(result => {
    const icon = result.status === 'ok' ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.status}`);
    if (result.status === 'ok' && result.message.length < 200) {
      console.log(`   ${result.message}`);
    }
  });

  console.log('\n' + '='.repeat(70));
}

checkServicesMain().catch(console.error);

