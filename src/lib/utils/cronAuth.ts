/**
 * Cron Job Authorization Utilities
 * Shared authorization logic for cron job endpoints
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify cron job authorization
 * Returns null if authorized, or error response if unauthorized
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  // Support both env var names:
  // - CRON_SECRET_KEY (preferred)
  // - CRON_SECRET (legacy / used by some routes)
  const secret = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET;
  const expectedAuth = `Bearer ${secret}`;
  
  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return null;
}

/**
 * Verify cron job authorization with optional production check
 * In production, requires auth. In development, allows without auth if allowDevWithoutAuth is true
 */
export function verifyCronAuthOptional(
  request: NextRequest,
  allowDevWithoutAuth: boolean = false
): NextResponse | null {
  const isProduction = process.env.NODE_ENV === 'production';
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET;
  const expectedAuth = `Bearer ${secret}`;
  
  // In production, always require auth
  if (isProduction) {
    if (authHeader !== expectedAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return null;
  }
  
  // In development, check if auth is required
  if (!allowDevWithoutAuth) {
    if (authHeader !== expectedAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  return null;
}
