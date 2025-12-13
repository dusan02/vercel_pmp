import { prisma } from '../src/lib/db/prisma.js';
import fs from 'fs';
import path from 'path';

async function checkLogoAvailability() {
    // Get some smaller market cap stocks
    const smallStocks = await prisma.ticker.findMany({
        where: {
            lastMarketCap: {
                lt: 10 // Less than 10B market cap
            }
        },
        select: {
            symbol: true,
            name: true,
            lastMarketCap: true,
            logoUrl: true
        },
        orderBy: {
            lastMarketCap: 'desc'
        },
        take: 20
    });

    console.log('Checking logo availability for smaller stocks:\n');

    const publicLogosDir = path.join(process.cwd(), 'public', 'logos');

    for (const stock of smallStocks) {
        const logo32 = path.join(publicLogosDir, `${stock.symbol.toLowerCase()}-32.webp`);
        const logo64 = path.join(publicLogosDir, `${stock.symbol.toLowerCase()}-64.webp`);

        const has32 = fs.existsSync(logo32);
        const has64 = fs.existsSync(logo64);

        const status = has32 && has64 ? '✅' : '❌';
        console.log(`${status} ${stock.symbol} (${stock.name}) - MCap: ${stock.lastMarketCap?.toFixed(2)}B - Logo: ${has32 ? '32✓' : '32✗'} ${has64 ? '64✓' : '64✗'}`);
    }

    await prisma.$disconnect();
}

checkLogoAvailability().catch(console.error);
