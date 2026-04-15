
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';
const symbol = 'HII';

async function checkHII() {
    console.log(`Checking Finnhub Reported Financials for ${symbol}...`);
    const url = `https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&token=${FINNHUB_API_KEY}&freq=annual`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            console.log('No data found for HII');
            return;
        }

        const latest = data.data[0];
        console.log(`Latest Report Date: ${latest.endDate}`);
        console.log(`Latest Report Year: ${latest.year}`);
        
        const bs = latest.report.bs || [];
        console.log('\n--- Balance Sheet Tags ---');
        bs.forEach(item => {
            if (item.concept.toLowerCase().includes('cash') || item.label.toLowerCase().includes('cash') || item.concept.toLowerCase().includes('debt')) {
                console.log(`${item.concept}: ${item.value} (${item.label})`);
            }
        });

        const ic = latest.report.ic || [];
        console.log('\n--- Income Statement Tags ---');
        ic.forEach(item => {
            if (item.concept.toLowerCase().includes('revenue') || item.concept.toLowerCase().includes('income')) {
                console.log(`${item.concept}: ${item.value} (${item.label})`);
            }
        });

    } catch (e) {
        console.error('Error fetching data:', e);
    }
}

checkHII();
