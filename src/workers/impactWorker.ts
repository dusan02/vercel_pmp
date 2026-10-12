import { prisma } from '@/lib/db/prisma';

/**
 * Impact Worker: Tracks the performance of MoverEvents over time.
 *
 * Field semantics (each is a distinct, non-interchangeable measure):
 * - impact1h:      % change priceAtEvent → ticker.lastPrice, written on the
 *                  first run ≥1h after the event (≈1h ± cron interval). Only
 *                  tracked for events <24h old.
 * - impactEndDay:  % change priceAtEvent → regular close of event.date.
 * - impactNextDay: % change event-day regular close → NEXT trading day's
 *                  regular close (pure next-day return — the fade signal).
 */
export async function updateMoverImpacts() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    try {
        // 1. 1-hour impact — first run ≥1h after the event
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

        // 2. EOD + next-day impact — events ≥6h old with any unfilled field.
        // Per event, fetch the first two DailyRef closes on/after event.date
        // (event day + next trading day) and fill both fields in one pass.
        const pending = await prisma.moverEvent.findMany({
            where: {
                timestamp: { lt: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
                OR: [{ impactEndDay: null }, { impactNextDay: null }]
            },
            select: {
                id: true, symbol: true, date: true, priceAtEvent: true,
                impactEndDay: true, impactNextDay: true
            }
        });

        let filled = 0;
        for (const event of pending) {
            const refs = await prisma.dailyRef.findMany({
                where: {
                    symbol: event.symbol,
                    date: { gte: event.date },
                    regularClose: { not: null }
                },
                orderBy: { date: 'asc' },
                take: 2,
                select: { date: true, regularClose: true }
            });

            const eventDay = refs[0];
            const nextDay = refs[1];
            // Guard: refs[0] must BE the event day — if event.date's DailyRef is
            // missing (data gap), refs[0] is a later day and EOD would be wrong.
            const hasEventDay = eventDay != null
                && eventDay.date.getTime() === event.date.getTime()
                && eventDay.regularClose != null;

            const data: { impactEndDay?: number; impactNextDay?: number } = {};
            if (hasEventDay && event.impactEndDay == null) {
                data.impactEndDay =
                    ((eventDay.regularClose! - event.priceAtEvent) / event.priceAtEvent) * 100;
            }
            if (hasEventDay && nextDay?.regularClose != null && event.impactNextDay == null) {
                data.impactNextDay =
                    ((nextDay.regularClose - eventDay.regularClose!) / eventDay.regularClose!) * 100;
            }
            if (Object.keys(data).length > 0) {
                await prisma.moverEvent.update({ where: { id: event.id }, data });
                filled++;
            }
        }

        if (pending1h.length > 0 || filled > 0) {
            console.log(`📈 [ImpactWorker] Updated ${pending1h.length} 1h-impacts and ${filled} EOD/next-day impacts.`);
        }
    } catch (error) {
        console.error('❌ [ImpactWorker] Error updating mover impacts:', error);
    }
}
