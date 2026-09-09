import { prisma } from '@/lib/db/prisma';
import { nowET } from '@/lib/utils/dateET';
import { calculatePercentChange } from '@/lib/utils/priceResolver';

/**
 * Impact Worker: Tracks the performance of MoverEvents over time.
 * This worker updates 'impact1h' and 'impactEndDay' for historical moves.
 */
export async function updateMoverImpacts() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    try {
        // 1. Update 1-hour impact (impact1h)
        // Find events that are older than 1h, but haven't been tracked yet
        const pending1h = await prisma.moverEvent.findMany({
            where: {
                impact1h: null,
                timestamp: {
                    lt: oneHourAgo,
                    gt: new Date(now.getTime() - 24 * 60 * 60 * 1000)
                }
            },
            include: { ticker: true }
        });

        for (const event of pending1h) {
            if (event.ticker.lastPrice) {
                const impact = ((event.ticker.lastPrice - event.priceAtEvent) / event.priceAtEvent) * 100;
                await prisma.moverEvent.update({
                    where: { id: event.id },
                    data: { impact1h: impact }
                });
            }
        }

        // 2. Update End of Day impact (impactEndDay)
        // Find events from current/previous trading day that are now closed
        // This usually runs at market close or after.
        const pendingEOD = await prisma.moverEvent.findMany({
            where: {
                impactEndDay: null,
                // Only follow up for events older than 6 hours (usually end of session)
                timestamp: { lt: new Date(now.getTime() - 6 * 60 * 60 * 1000) }
            },
            include: { ticker: true }
        });

        for (const event of pendingEOD) {
            // If the ticker has a regular close for that day, use it
            const dailyRef = await prisma.dailyRef.findUnique({
                where: { symbol_date: { symbol: event.symbol, date: event.date } }
            });

            if (dailyRef && dailyRef.regularClose) {
                const impact = ((dailyRef.regularClose - event.priceAtEvent) / event.priceAtEvent) * 100;
                await prisma.moverEvent.update({
                    where: { id: event.id },
                    data: { impactEndDay: impact }
                });
            }
        }

        if (pending1h.length > 0 || pendingEOD.length > 0) {
            console.log(`📈 [ImpactWorker] Updated ${pending1h.length} 1h-impacts and ${pendingEOD.length} EOD-impacts.`);
        }
    } catch (error) {
        console.error('❌ [ImpactWorker] Error updating mover impacts:', error);
    }
}
