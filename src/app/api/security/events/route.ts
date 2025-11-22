import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '@/lib/security/security';
import { getSecurityEvents } from '@/lib/security/security-events';

export async function GET(request: NextRequest) {
  // Validate API key
  const validation = validateRequest(request);
  if (!validation.isValid) {
    return NextResponse.json({
      success: false,
      error: 'Unauthorized - Invalid or missing API key'
    }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const type = searchParams.get('type') || undefined;
    const ip = searchParams.get('ip') || undefined;

    const events = getSecurityEvents(limit, type, ip);

    return NextResponse.json({
      success: true,
      data: {
        events,
        total: events.length,
        limit,
        filters: { type, ip }
      }
    });

  } catch (error) {
    console.error('Error fetching security events:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch security events'
    }, { status: 500 });
  }
} 