import { prisma } from '../src/lib/db/prisma';

async function seedSubscription() {
    console.log('🌱 Seeding dummy subscription...');

    await (prisma as any).subscription.upsert({
        where: { endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint' },
        update: {},
        create: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
            p256dh: 'BNcR6S9M_K6jvSZI9S2p_x2G02ZPMLSMYYwZL7CoNnYlvg-wbN5o0uMQN33azAJjZEmkAbkJDmpYNUKmVk8',
            auth: '9uAouXf9MS8RtHEQrg6mLXIAusiA9MjdtTMjp2VFMCs',
            email: 'test@example.com'
        }
    });

    console.log('✅ Dummy subscription seeded.');
}

seedSubscription().catch(console.error);
