import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuthOptional } from '@/lib/utils/cronAuth';

// Diagnostic endpoint — reports only whether secrets are SET (booleans), never their values.
export async function GET(request: NextRequest) {
    const authError = verifyCronAuthOptional(request, true);
    if (authError) return authError;

    const config = {
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID?.trim(),
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET?.trim(),
        hasAuthSecret: !!(process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()),
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL?.trim(),
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
