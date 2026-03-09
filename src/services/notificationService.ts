import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { prisma } from '@/lib/db/prisma';

// Configure Web Push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:support@premarketprice.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

// Configure Mailer
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export class NotificationService {
    /**
     * Notify subscribers about a new Quality Breakout
     */
    static async notifyQualityBreakout(ticker: string, stats: { health: number, altmanZ: number }) {
        console.log(`[NotificationService] Processing breakout for ${ticker}...`);

        try {
            // 1. Fetch all active subscriptions
            const subscriptions = await (prisma as any).subscription.findMany();

            if (subscriptions.length === 0) {
                console.log('[NotificationService] No subscribers found.');
                return;
            }

            const title = `🚀 Quality Breakout: ${ticker}`;
            const message = `${ticker} just entered the Safe Zone! Altman Z: ${stats.altmanZ.toFixed(2)}, Health Score: ${stats.health}.`;

            // 2. Multi-channel delivery
            for (const sub of subscriptions) {
                // Send Push
                if (sub.endpoint) {
                    try {
                        await webpush.sendNotification({
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        }, JSON.stringify({
                            title,
                            body: message,
                            ticker,
                            url: `/` // Or deep link to analysis
                        }));
                        console.log(`[Push] Sent to ${sub.id}`);
                    } catch (pushErr) {
                        console.error(`[Push] Failed for ${sub.id}:`, pushErr);
                        // Optional: remove stale subscription
                    }
                }

                // Send E-mail
                if (sub.email) {
                    try {
                        const unsubscribeUrl = `${process.env.NEXTAUTH_URL}/api/notifications/unsubscribe?email=${encodeURIComponent(sub.email)}`;

                        await transporter.sendMail({
                            from: process.env.NOTIFICATIONS_FROM,
                            to: sub.email,
                            subject: title,
                            headers: {
                                'List-Unsubscribe': `<${unsubscribeUrl}>`,
                                'Precedence': 'bulk'
                            },
                            html: `
                                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #2563eb; margin-top: 0;">🚀 Quality Breakout: ${ticker}</h2>
                                    <p style="color: #374151; font-size: 16px; line-height: 1.5;">
                                        ${message}
                                    </p>
                                    <div style="margin: 30px 0;">
                                        <a href="${process.env.NEXTAUTH_URL}/?tab=analysis&ticker=${ticker}" 
                                           style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
                                           View Deep Dive Analysis
                                        </a>
                                    </div>
                                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                                    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                                        Odeberáte upozornenia na Quality Breakouts z PreMarketPrice.<br>
                                        <a href="${unsubscribeUrl}" style="color: #9ca3af; text-decoration: underline;">Odhlásiť sa</a>
                                    </p>
                                </div>
                            `
                        });
                        console.log(`[E-mail] Sent to ${sub.email}`);
                    } catch (mailErr) {
                        console.error(`[E-mail] Failed for ${sub.email}:`, mailErr);
                    }
                }
            }
        } catch (error) {
            console.error('[NotificationService] Critical error in rollout:', error);
        }
    }
}
