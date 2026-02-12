
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const symbol = process.argv[2] || 'AAPL';
    console.log(`Checking database for: ${symbol}`);
    
    try {
        const ticker = await prisma.ticker.findUnique({
            where: { symbol },
            select: { 
                symbol: true, 
                lastPrice: true, 
                latestPrevClose: true, 
                lastPriceUpdated: true, 
                percentChange: true, 
                marketCap: true 
            }
        });
        console.log(`${symbol}:`, ticker);
    } catch (error) {
        console.error('Error fetching ticker:', error);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
