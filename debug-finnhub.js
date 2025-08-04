// Debug súbor pre kontrolu Finnhub API
const fetch = require('node-fetch');

async function debugFinnhubAPI() {
  console.log('🔍 Debugging Finnhub API...');
  
  try {
    const apiKey = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';
    const date = '2025-08-04';
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&token=${apiKey}`;
    
    console.log('📡 Fetching from:', url);
    
    const response = await fetch(url);
    console.log('Response status:', response.status);
    
    const data = await response.json();
    console.log('📊 Total earnings in Finnhub:', data.earningsCalendar?.length || 0);
    
    // Vypíš všetky tickery z Finnhub
    const allTickers = data.earningsCalendar?.map(e => e.symbol) || [];
    console.log('📋 All tickers from Finnhub:', allTickers);
    
    // Naše tickery, ktoré by mali mať earnings podľa Yahoo Finance
    const expectedTickers = ['PLTR', 'MELI', 'VRTX', 'WMB', 'SPG', 'AXON', 'OKE', 'FANG'];
    
    console.log('\n🔍 Checking expected tickers:');
    for (const ticker of expectedTickers) {
      const found = allTickers.includes(ticker);
      console.log(`${ticker}: ${found ? '✅' : '❌'}`);
    }
    
    // Vypíš detailné info pre nájdené tickery
    console.log('\n📋 Detailed info for found tickers:');
    const foundEarnings = data.earningsCalendar?.filter(e => expectedTickers.includes(e.symbol)) || [];
    for (const earning of foundEarnings) {
      console.log(`${earning.symbol}: ${earning.time} (${earning.epsEstimate || 'N/A'} EPS est.)`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugFinnhubAPI(); 