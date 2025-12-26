import { NextResponse } from 'next/server';

export async function GET() {
    const config = {
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID?.trim(),
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET?.trim(),
        hasAuthSecret: !!(process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()),
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL?.trim(),
        nextAuthUrl: process.env.NEXTAUTH_URL?.trim() || 'NOT SET',
        googleClientIdPrefix: process.env.GOOGLE_CLIENT_ID?.trim().substring(0, 20) || 'NOT SET',
        isConfigValid: false,
    };

    config.isConfigValid = 
        config.hasGoogleClientId && 
        config.hasGoogleClientSecret && 
        config.hasAuthSecret && 
        config.hasNextAuthUrl;

    return NextResponse.json(config, {
        status: config.isConfigValid ? 200 : 500,
    });
}

