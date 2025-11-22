import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // No-op: Data ingestion is now handled exclusively by the background worker.
  // Returning success to avoid breaking legacy clients.
  return NextResponse.json({
    message: 'Cache update handled by background worker',
    success: true
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Cache update handled by background worker',
    success: true
  });
}