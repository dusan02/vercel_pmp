import { prisma } from './src/lib/db/prisma';

async function test() {
    const ticker = await prisma.ticker.findFirst();
    if (ticker) {
        console.log('Fields:', Object.keys(ticker));
        // This is a type-level check
        const copy: string | null = ticker.socialCopy;
        console.log('socialCopy:', copy);
    }
}
