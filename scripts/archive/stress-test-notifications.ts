import { NotificationService } from '../src/services/notificationService';

async function runStressTest() {
    console.log('🚀 Starting Notification Stress Test...');
    console.log('---------------------------------------');

    const totalSimulations = 100;
    const tickerPrefix = 'STRESS-';
    const startTime = Date.now();

    const tasks = [];

    for (let i = 1; i <= totalSimulations; i++) {
        const symbol = `${tickerPrefix}${i}`;
        const stats = {
            health: Math.floor(Math.random() * 20) + 81, // 81-100
            altmanZ: Math.random() * 2 + 3.1 // 3.1-5.1
        };

        // We use the real service, which will look for subscriptions in the DB
        // If there are no subscriptions, it will log and skip, which is still a good test
        // of volume. If there ARE subscriptions, it will attempt delivery.
        tasks.push(
            NotificationService.notifyQualityBreakout(symbol, stats)
                .catch(err => console.error(`[Simulation ${i}] Failed:`, err.message))
        );

        if (i % 10 === 0) {
            console.log(`[Status] Queued ${i}/${totalSimulations} simulations...`);
        }
    }

    // Run all concurrently
    await Promise.all(tasks);

    const duration = (Date.now() - startTime) / 1000;
    console.log('---------------------------------------');
    console.log(`✅ Stress Test Completed in ${duration.toFixed(2)}s`);
    console.log(`📊 Average time per notification: ${(duration / totalSimulations).toFixed(4)}s`);
    console.log('---------------------------------------');
}

runStressTest().catch(console.error);
