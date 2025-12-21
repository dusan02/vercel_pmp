import { NextRequest, NextResponse } from 'next/server';
import { isSectorIndustrySchedulerActive } from '@/lib/jobs/sectorIndustryScheduler';

/**
 * GET endpoint to check cron job scheduler status
 */
export async function GET(request: NextRequest) {
  try {
    const schedulerActive = isSectorIndustrySchedulerActive();
    
    return NextResponse.json({
      success: true,
      data: {
        schedulerActive,
        message: schedulerActive 
          ? 'Sector/Industry scheduler is running'
          : 'Sector/Industry scheduler is not active',
        cronJobs: {
          sectorIndustry: {
            active: schedulerActive,
            schedule: 'Daily at 02:00 UTC',
            description: 'Verifies and fixes sector/industry data for all tickers'
          }
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking cron status:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to check cron status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

