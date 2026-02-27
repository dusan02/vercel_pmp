import { NextRequest, NextResponse } from 'next/server';
import { updateMoverImpacts } from '@/workers/impactWorker';

export async function GET(req: NextRequest) {
    // Simple secret check could be added here if needed
    try {
        await updateMoverImpacts();
        return NextResponse.json({
            success: true,
            message: 'Mover impacts updated successfully'
        });
    } catch (error) {
        console.error('Error in /api/cron/mover-impact:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
