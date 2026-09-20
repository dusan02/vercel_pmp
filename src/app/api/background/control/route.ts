import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundService } from '@/lib/backgroundService';
import { getCronAuth } from '@/lib/cronAuth';

export async function POST(request: NextRequest) {
  const auth = await getCronAuth(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action } = await request.json();
    const service = getBackgroundService();

    if (!service) {
      return NextResponse.json({
        success: false,
        error: 'Background service not initialized'
      }, { status: 404 });
    }

    switch (action) {
      case 'start':
        await service.start();
        return NextResponse.json({
          success: true,
          message: 'Background service started'
        });

      case 'stop':
        service.stop();
        return NextResponse.json({
          success: true,
          message: 'Background service stopped'
        });

      case 'force-update':
        await service.forceUpdate();
        return NextResponse.json({
          success: true,
          message: 'Forced background update completed'
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: start, stop, or force-update'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error controlling background service:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to control background service'
    }, { status: 500 });
  }
} 