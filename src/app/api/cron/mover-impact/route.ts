import { NextRequest, NextResponse } from 'next/server';
import { updateMoverImpacts } from '@/workers/impactWorker';
import { verifyCronAuthOptional } from '@/lib/utils/cronAuth';

export async function GET(req: NextRequest) {
    const authError = verifyCronAuthOptional(req, true);
    if (authError) return authError;
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
