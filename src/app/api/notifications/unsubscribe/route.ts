import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email');

        if (!email) {
            return new Response('Email is required', { status: 400 });
        }

        // Delete all subscriptions for this email
        await (prisma as any).subscription.deleteMany({
            where: { email }
        });

        // Return a simple HTML success message
        return new NextResponse(`
            <html>
                <head>
                    <title>Unsubscribed - PreMarketPrice</title>
                    <style>
                        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
                        .card { background: white; padding: 40px; border-radius: 12px; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; border: 1px solid #e2e8f0; }
                        h1 { color: #2563eb; margin-top: 0; }
                        p { color: #64748b; }
                        .btn { display: inline-block; margin-top: 20px; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Boli ste odhlásení</h1>
                        <p>Váš e-mail <strong>${email}</strong> bol úspešne odstránený z odberu Quality Breakout alertov.</p>
                        <a href="/" class="btn">Späť na terminál</a>
                    </div>
                </body>
            </html>
        `, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    } catch (error) {
        console.error('Error unsubscribing:', error);
        return new Response('Vyskytla sa chyba pri odhlasovaní.', { status: 500 });
    }
}
